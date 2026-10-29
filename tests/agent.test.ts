import assert from "node:assert/strict";
import test from "node:test";
import { mealPool, runAgent, sanitizeInput } from "../lib/agent.ts";
import { mealExcludeTags } from "../lib/meal.ts";
import type { TraceEntry } from "../lib/qloo/types.ts";
import { mockQloo } from "../lib/qloo/mock.ts";

delete process.env.QLOO_API_KEY;
delete process.env.LLM_API_KEY;
process.env.QLOO_MOCK = "1";

const group = {
  city: "Brooklyn, New York",
  brief: "Saturday dinner, not too pricey, then drinks",
  members: [
    { name: "Mina", favorites: ["Parasite", "Norah Jones", "Stardew Valley"] },
    { name: "Leo", favorites: ["Blade Runner 2049", "Daft Punk", "Severance"] },
    { name: "Ava", favorites: ["Before Sunrise", "Phoebe Bridgers", "Norwegian Wood"] },
  ],
};

test("mock errors follow the live API shape", () => {
  const unknown = mockQloo("/search", { query: "zzzz not a thing" });
  assert.equal(unknown.status, 200);
  assert.deepEqual((unknown.body as { results: unknown[] }).results, []);
  const noType = mockQloo("/v2/insights", {});
  assert.equal(noType.status, 400);
  assert.equal((noType.body as { errors: { message: string }[] }).errors[0].message, "filter.type is required");
  const byId = mockQloo("/v2/insights", { "filter.type": "urn:entity:place", "filter.location": "MOCK-PLACE-LOUD-LIBRARY", "signal.interests.entities": "x" });
  assert.equal(byId.status, 400);
});

test("mock insights carry query.affinity and explainability like the live API", () => {
  const res = mockQloo("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.location": "POINT(-73.957 40.717)",
    "filter.location.radius": 6000,
    "signal.interests.entities": "MOCK-MOVIE-PARASITE,MOCK-ARTIST-NORAH-JONES",
    "feature.explainability": "true",
  });
  assert.equal(res.status, 200);
  const e = (res.body as { results: { entities: { query: { affinity: number; distance?: number; explainability: Record<string, { entity_id: string; score: number }[]> } }[] } }).results.entities[0];
  assert.ok(e, "no entity within radius");
  assert.equal(typeof e.query.affinity, "number");
  const drivers = e.query.explainability["signal.interests.entities"];
  assert.ok(drivers.every((d) => typeof d.entity_id === "string" && typeof d.score === "number"));
});

test("agent picks a dinner that scores every member", async () => {
  const input = sanitizeInput(group);
  assert.notEqual(typeof input, "string");
  const res = await runAgent(input as Exclude<typeof input, string>);
  assert.equal(res.ok, true, JSON.stringify(res).slice(0, 300));
  if (!res.ok) return;
  assert.equal(res.dinner.scores.length, 3);
  for (const s of res.dinner.scores) assert.ok(s.affinity > 0);
  assert.ok(res.nextStop);
  assert.ok(res.movie);
  assert.equal(res.modes.qloo, "mock");
  assert.ok(res.trace.every((t) => !JSON.stringify(t.params).includes("Api-Key")));
  assert.ok(res.trace.length <= 45, `trace ${res.trace.length}`);
  for (const n of ["Mina", "Leo", "Ava"]) assert.ok(res.story.dinner[n]);
  assert.equal(res.story.fallbackReason, "no LLM key");
  assert.ok(res.dinner.scores.some((s) => s.drivers.length), "explainability drivers were not parsed");
  const near = res.trace.filter((t) => t.step.includes("of dinner"));
  assert.ok(near.length && near.every((t) => /^POINT\(-?[\d.]+ -?[\d.]+\)$/.test(String(t.params["filter.location"]))), "next stop must use a WKT point");
  assert.ok(!res.trace.some((t) => t.status >= 400), "a call failed");
});

test("without a Qloo key and without QLOO_MOCK the agent refuses to plan", async () => {
  delete process.env.QLOO_MOCK;
  try {
    const res = await runAgent(sanitizeInput(group) as never);
    assert.equal(res.ok, false);
    assert.equal(res.trace.length, 0);
  } finally {
    process.env.QLOO_MOCK = "1";
  }
});

test("fairness never prefers a pick with a lower minimum and lower mean", async () => {
  const res = await runAgent(sanitizeInput(group) as never);
  if (!res.ok) throw new Error(res.error);
  for (const alt of res.alternatives) assert.ok(!(alt.minAffinity > res.dinner.minAffinity && alt.meanAffinity > res.dinner.meanAffinity));
});

test("sanitizeInput rejects a one-person group", () => {
  assert.equal(typeof sanitizeInput({ city: "NYC", members: [{ name: "A", favorites: ["Parasite"] }] }), "string");
});

const DECOYS = ["Whisker Room Cat Cafe", "Hero Express", "Velvet Hour"];

test("decoys outrank real restaurants when nothing filters them", () => {
  const res = mockQloo("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.tags": "urn:tag:category:place:restaurant",
    "signal.interests.entities": "MOCK-MOVIE-PARASITE,MOCK-ARTIST-NORAH-JONES,MOCK-MOVIE-BLADE-RUNNER-2049,MOCK-TV-SEVERANCE,MOCK-MOVIE-BEFORE-SUNRISE,MOCK-BOOK-NORWEGIAN-WOOD",
    take: 5,
  });
  const top = (res.body as { results: { entities: { name: string }[] } }).results.entities.map((e) => e.name);
  assert.ok(DECOYS.every((d) => top.includes(d)), top.join(", "));
});

test("dinner never lands on a cat cafe, a chain or a cocktail bar", async () => {
  const res = await runAgent(sanitizeInput(group) as never);
  if (!res.ok) throw new Error(res.error);
  assert.equal(res.plan.meal, "dinner");
  const shown = [res.dinner, ...res.alternatives, res.pooledPick].filter(Boolean).map((p) => p!.name);
  for (const d of DECOYS) assert.ok(!shown.includes(d), `${d} in ${shown.join(", ")}`);
  const step = res.trace.find((t) => t.step === "Dinner candidates from combined taste");
  assert.equal(step?.params["filter.exclude.tags"], mealExcludeTags("dinner").join(","));
  assert.ok(res.notes.some((n) => n.includes("Hero Express")), res.notes.join(" | "));
});

test("a tight budget widens the search before giving up on sit-down places", async () => {
  process.env.QLOO_MOCK = "1";
  const trace: TraceEntry[] = [];
  const notes: string[] = [];
  const pool = await mealPool("Brooklyn, New York", "dinner", {
    "filter.type": "urn:entity:place",
    "filter.tags": "urn:tag:category:place:restaurant",
    "filter.exclude.tags": mealExcludeTags("dinner").join(","),
    "signal.interests.entities": "MOCK-MOVIE-PARASITE,MOCK-ARTIST-NORAH-JONES",
    "filter.price_level.max": 1,
    take: 25,
  }, notes, trace);
  assert.deepEqual(trace.map((t) => t.step), ["Dinner candidates from combined taste", "Wider dinner search, 2 fit so far", "Wider dinner search without the price cap"]);
  assert.ok(pool.length >= 6, `pool ${pool.length}`);
  assert.deepEqual(pool.slice(0, 2).map((p) => p.properties?.price_level), [1, 1], "budget picks stay first");
  assert.ok(notes.some((n) => n.startsWith("Only 2 dinner spots fit the budget")), notes.join(" | "));
  assert.ok(!pool.some((p) => DECOYS.includes(p.name)));
});
