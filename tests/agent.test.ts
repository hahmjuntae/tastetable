import assert from "node:assert/strict";
import test from "node:test";
import { runAgent, sanitizeInput } from "../lib/agent.ts";
import { mockQloo } from "../lib/qloo/mock.ts";

delete process.env.QLOO_API_KEY;
delete process.env.LLM_API_KEY;

const group = {
  city: "Brooklyn, New York",
  brief: "Saturday dinner, not too pricey, then drinks",
  members: [
    { name: "Mina", favorites: ["Parasite", "Norah Jones", "Stardew Valley"] },
    { name: "Leo", favorites: ["Blade Runner 2049", "Daft Punk", "Severance"] },
    { name: "Ava", favorites: ["Before Sunrise", "Phoebe Bridgers", "Norwegian Wood"] },
  ],
};

test("mock search follows the documented error for unknown names", () => {
  assert.equal(mockQloo("/search", { query: "zzzz not a thing" }).status, 404);
  assert.equal(mockQloo("/v2/insights", {}).status, 400);
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
});

test("fairness never prefers a pick with a lower minimum and lower mean", async () => {
  const res = await runAgent(sanitizeInput(group) as never);
  if (!res.ok) throw new Error(res.error);
  for (const alt of res.alternatives) assert.ok(!(alt.minAffinity > res.dinner.minAffinity && alt.meanAffinity > res.dinner.meanAffinity));
});

test("sanitizeInput rejects a one-person group", () => {
  assert.equal(typeof sanitizeInput({ city: "NYC", members: [{ name: "A", favorites: ["Parasite"] }] }), "string");
});
