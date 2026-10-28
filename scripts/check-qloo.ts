// 실제 Qloo 응답 형태 점검 스크립트, 키와 응답 본문은 저장하지 않음

const USAGE = 'QLOO_API_KEY="$(security find-generic-password -s hackathon-qloo-key -w)" node scripts/check-qloo.ts [--agent]';
const KEY = process.env.QLOO_API_KEY?.trim();
const BASE = (process.env.QLOO_BASE_URL?.trim() || "https://hackathon.api.qloo.com").replace(/\/$/, "");

if (!KEY) {
  console.error(`QLOO_API_KEY is not set. Usage: ${USAGE}`);
  process.exit(1);
}

type Json = Record<string, unknown>;

async function get(path: string, params: Record<string, string | number | boolean>) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const started = Date.now();
  const res = await fetch(`${BASE}${path}?${qs}`, { headers: { "X-Api-Key": KEY!, accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as Json | null;
  console.log(`\n${res.status} GET ${path}?${qs} (${Date.now() - started} ms)`);
  return { status: res.status, body };
}

const keys = (v: unknown) => (v && typeof v === "object" ? Object.keys(v as object).join(", ") : String(v));
const short = (v: unknown, n = 400) => JSON.stringify(v)?.slice(0, n);

function entities(body: Json | null): Json[] {
  const r = body?.results as Json | Json[] | undefined;
  if (Array.isArray(r)) return r;
  return ((r?.entities as Json[]) ?? []) as Json[];
}

const failures: string[] = [];
const expect = (ok: boolean, label: string) => {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
};

const s = await get("/search", { query: "Parasite", take: 1 });
const hit = entities(s.body)[0];
console.log("  top-level keys:", keys(s.body), "| results is array:", Array.isArray(s.body?.results));
console.log("  first result keys:", keys(hit));
console.log("  name/entity_id/subtype/types:", hit?.name, hit?.entity_id, hit?.subtype, short(hit?.types));
expect(Boolean(hit?.entity_id), "/search returns results[0].entity_id");

const artist = entities((await get("/search", { query: "Norah Jones", take: 1 })).body)[0];
const ids = [hit?.entity_id, artist?.entity_id].filter(Boolean).join(",");

const t = await get("/v2/tags", { "filter.query": "restaurant", take: 5 });
console.log("  top-level keys:", keys(t.body), "| results keys:", keys(t.body?.results));
console.log("  sample:", short(t.body?.results, 600));
const tagList = (Array.isArray(t.body?.results) ? t.body?.results : (t.body?.results as Json)?.tags) as Json[] | undefined;
const restaurantTag = String(tagList?.map((x) => x.id ?? x.tag_id).find((id) => String(id).includes(":place:")) ?? "urn:tag:category:place:restaurant");
console.log("  chosen restaurant tag:", restaurantTag);

const placeParams = { "filter.type": "urn:entity:place", "filter.tags": restaurantTag, "signal.interests.entities": ids, take: 5 };
let p = await get("/v2/insights", { ...placeParams, "filter.location.query": "New York" });
if (p.status === 400) {
  console.log("  filter.location.query returned 400, retrying with signal.location.query");
  p = await get("/v2/insights", { ...placeParams, "signal.location.query": "New York" });
}
const places = entities(p.body);
const place = places[0];
const props = (place?.properties ?? {}) as Json;
console.log("  places:", places.map((x) => x.name).join(" | "));
console.log("  place keys:", keys(place));
console.log("  properties keys:", keys(props));
console.log("  query:", short(place?.query), "| top-level affinity:", place?.affinity);
console.log("  location:", short(place?.location), "| geocode:", short(props.geocode));
console.log("  price_level:", props.price_level, "| business_rating:", props.business_rating, "| address:", props.address);
expect(places.length > 0, "place insights return entities");
expect(typeof (place?.query as Json)?.affinity === "number" || typeof place?.affinity === "number", "place result has an affinity number");

if (places.length) {
  const scored = await get("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.results.entities": places.map((x) => x.entity_id).join(","),
    "signal.interests.entities": String(hit?.entity_id ?? ""),
    "feature.explainability": true,
    take: places.length,
  });
  const se = entities(scored.body);
  console.log("  scored names:", se.map((x) => `${x.name}=${(x.query as Json)?.affinity ?? x.affinity}`).join(" | "));
  console.log("  explainability sample:", short((se[0]?.query as Json)?.explainability, 600));
  console.log("  top-level query keys:", keys((scored.body as Json)?.query));
  expect(se.length > 0, "filter.results.entities rescoring returns the same candidates");

  const near = await get("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.location": String(place.entity_id),
    "filter.location.radius": 2500,
    "signal.interests.entities": ids,
    take: 5,
  });
  console.log("  near dinner:", entities(near.body).map((x) => x.name).join(" | "));
  expect(entities(near.body).length > 0, "filter.location with an entity ID returns nearby places");
}

const tg = await get("/v2/insights", { "filter.type": "urn:tag", "signal.interests.entities": ids, take: 5 });
const tags = (tg.body?.results as Json)?.tags as Json[] | undefined;
console.log("  tags:", tags?.map((x) => `${x.name} (${x.tag_id})`).join(" | "));
expect(Boolean(tags?.length), "tag insights return results.tags");

const mv = await get("/v2/insights", { "filter.type": "urn:entity:movie", "signal.interests.entities": ids, take: 3 });
console.log("  movies:", entities(mv.body).map((x) => x.name).join(" | "));
expect(entities(mv.body).length > 0, "movie insights return entities");

if (process.argv.includes("--agent")) {
  const { runAgent } = await import("../lib/agent.ts");
  const res = await runAgent({
    city: "New York",
    brief: "Saturday dinner, not too pricey, then drinks",
    members: [
      { name: "Mina", favorites: ["Parasite", "Norah Jones"] },
      { name: "Leo", favorites: ["Blade Runner 2049", "Daft Punk"] },
      { name: "Ava", favorites: ["Before Sunrise", "Phoebe Bridgers"] },
    ],
  });
  console.log("\nagent:", res.ok ? `${res.dinner.name} (lowest ${res.dinner.minAffinity}), next ${res.nextStop?.name}, movie ${res.movie?.name}` : res.error);
  for (const step of res.trace) console.log(`  ${step.status} ${step.count} ${step.step}`);
  expect(res.ok, "full agent run succeeds against the live API");
}

console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);

export {};
