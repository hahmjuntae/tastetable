import { BY_ID, CATALOG, CATEGORY_TAGS, DIM_TAGS, type Category, type Dim, type MockEntity } from "./fixtures.ts";
import type { QlooEntity, QlooParams, QlooTagInsight } from "./types.ts";

// 실제 API 응답 틀(2026-10-29 확인)을 흉내 내는 결정적 목 서버, 테스트 전용

type MockResponse = { status: number; body: unknown };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

const list = (v: QlooParams[string]) =>
  typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

function vector(dims: Dim[][]): Map<Dim, number> {
  const v = new Map<Dim, number>();
  for (const group of dims) for (const d of group) v.set(d, (v.get(d) ?? 0) + 1);
  return v;
}

function cosine(a: Map<Dim, number>, b: Map<Dim, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, x] of a) {
    na += x * x;
    dot += x * (b.get(k) ?? 0);
  }
  for (const x of b.values()) nb += x * x;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

function affinity(signal: Map<Dim, number>, e: MockEntity): number {
  const c = cosine(signal, vector([e.dims]));
  return round(Math.min(0.99, 0.32 + 0.66 * Math.pow(c, 0.85) + 0.04 * (e.popularity - 0.9)));
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function toQlooEntity(e: MockEntity, extra: Partial<QlooEntity> = {}): QlooEntity {
  const tags = e.dims.map((d) => DIM_TAGS[d]);
  if (e.place) for (const c of e.place.categories) tags.unshift(CATEGORY_TAGS[c]);
  return {
    name: e.name,
    entity_id: e.id,
    type: "urn:entity",
    subtype: e.subtype,
    types: [e.subtype],
    popularity: e.popularity,
    properties: e.place
      ? {
          description: e.place.blurb,
          address: `${e.place.hood}, Brooklyn/Manhattan, NY (mock)`,
          price_level: e.place.price,
          business_rating: e.place.rating,
          geocode: { name: e.place.hood, admin1_region: "NY", country_code: "US" },
        }
      : {},
    ...(e.place ? { location: { lat: e.place.lat, lon: e.place.lon } } : {}),
    tags,
    ...extra,
  };
}

function search(params: QlooParams): MockResponse {
  const q = norm(String(params.query ?? ""));
  if (!q) return { status: 400, body: { errors: [{ message: "query is required" }] } };
  const types = list(params.types);
  const take = Number(params.take ?? 10);
  const scored = CATALOG.filter((e) => !types.length || types.includes(e.subtype))
    .map((e) => {
      const names = [e.name, ...(e.aliases ?? [])].map(norm);
      const score = names.some((n) => n === q) ? 3 : names.some((n) => n.startsWith(q) || q.startsWith(n)) ? 2 : names.some((n) => n.includes(q)) ? 1 : 0;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.e.popularity - a.e.popularity)
    .slice(0, take);
  // 실제 /search 는 subtype 없이 types 배열만 반환
  return { status: 200, body: { results: scored.map((x) => ({ ...toQlooEntity(x.e), type: undefined, subtype: undefined })) } };
}

const CATEGORY_WORDS: [RegExp, Category][] = [
  [/restaurant|dinner|food|eat/, "restaurant"],
  [/bar|drink|cocktail|wine|karaoke/, "bar"],
  [/music|jazz|concert|live|venue/, "music_venue"],
  [/dessert|sweet|ice cream|bakery/, "dessert"],
  [/cinema|movie|film|theater|theatre/, "cinema"],
];

function tags(params: QlooParams): MockResponse {
  const q = norm(String(params.query ?? params["filter.query"] ?? ""));
  const take = Number(params.take ?? 20);
  const out: { id: string; name: string; type: string }[] = [];
  for (const [re, cat] of CATEGORY_WORDS) if (re.test(q)) out.push(CATEGORY_TAGS[cat]);
  for (const t of Object.values(DIM_TAGS)) if (q && norm(t.name).includes(q)) out.push(t);
  return { status: 200, body: { success: true, results: { tags: out.slice(0, take) } } };
}

function insights(params: QlooParams): MockResponse {
  const type = String(params["filter.type"] ?? "");
  if (!type) return { status: 400, body: { errors: [{ message: "filter.type is required" }] } };
  const signalIds = list(params["signal.interests.entities"]);
  const signalEntities = signalIds.map((id) => BY_ID.get(id)).filter((e): e is MockEntity => Boolean(e));
  const filterTags = list(params["filter.tags"]);
  if (!signalEntities.length && !filterTags.length && !params["filter.location.query"]) {
    return { status: 400, body: { errors: [{ message: "at least one valid signal or filter is required" }] } };
  }
  const signal = vector(signalEntities.map((e) => e.dims));
  const take = Math.min(50, Number(params.take ?? 20));

  if (type === "urn:tag") {
    const total = [...signal.values()].reduce((a, b) => a + b, 0) || 1;
    const out: QlooTagInsight[] = [...signal.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, take)
      .map(([d, n]) => ({
        tag_id: DIM_TAGS[d].id,
        name: DIM_TAGS[d].name,
        types: ["urn:entity:place", "urn:entity:movie", "urn:entity:artist"],
        subtype: DIM_TAGS[d].type,
        tag_value: DIM_TAGS[d].id,
        query: { affinity: round(Math.min(0.99, 0.5 + n / total)) },
      }));
    return { status: 200, body: { success: true, results: { tags: out }, duration: 0.02 } };
  }

  if (type === "urn:entity:destination" || type === "urn:entity:locality") {
    return { status: 200, body: { success: true, results: { entities: [] }, duration: 0.01 } };
  }

  let pool = CATALOG.filter((e) => e.subtype === type);
  const results = list(params["filter.results.entities"]);
  if (results.length) pool = pool.filter((e) => results.includes(e.id));
  const exclude = new Set([...list(params["filter.exclude.entities"]), ...signalIds]);
  pool = pool.filter((e) => !exclude.has(e.id));

  if (filterTags.length) {
    pool = pool.filter((e) => {
      const ids = new Set([...e.dims.map((d) => DIM_TAGS[d].id), ...(e.place?.categories ?? []).map((c) => CATEGORY_TAGS[c].id)]);
      return filterTags.some((t) => ids.has(t));
    });
  }
  const priceMax = Number(params["filter.price_level.max"]);
  if (priceMax) pool = pool.filter((e) => !e.place || e.place.price <= priceMax);

  const location = params["filter.location"];
  if (typeof location === "string") {
    const m = location.match(/^POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i);
    if (!m) return { status: 400, body: { errors: [{ message: "No shapes were found for the filter locations that were provided.", path: "filter.location.query" }] } };
    const [lon, lat] = [Number(m[1]), Number(m[2])];
    const radius = Number(params["filter.location.radius"] ?? 15_000);
    pool = pool.filter((e) => e.place && haversine(lat, lon, e.place.lat, e.place.lon) <= radius);
  }

  const explain = params["feature.explainability"] === true || params["feature.explainability"] === "true";
  const ranked = pool
    .map((e) => {
      const a = signalEntities.length ? affinity(signal, e) : round(e.popularity);
      const extra: Partial<QlooEntity> = { query: { affinity: a } };
      if (explain && signalEntities.length) {
        const raw = signalEntities.map((s) => ({ entity_id: s.id, name: s.name, score: cosine(vector([s.dims]), vector([e.dims])) }));
        // 실제 응답은 entity_id 와 합이 1인 score 만 포함
        const total = raw.reduce((a, r) => a + r.score, 0) || 1;
        extra.query!.explainability = {
          "signal.interests.entities": raw.map((r) => ({ entity_id: r.entity_id, score: round(r.score / total) })),
        };
      }
      return toQlooEntity(e, extra);
    })
    .sort((x, y) => (y.query?.affinity ?? 0) - (x.query?.affinity ?? 0))
    .slice(0, take);
  return { status: 200, body: { success: true, results: { entities: ranked }, duration: 0.03 } };
}

export function mockQloo(path: string, params: QlooParams): MockResponse {
  if (path === "/search") return search(params);
  if (path === "/v2/tags") return tags(params);
  if (path === "/v2/insights") return insights(params);
  return { status: 404, body: { error: "No path matching request parameters" } };
}

export const MOCK_EXAMPLE_FAVORITES = CATALOG.filter((e) => !e.place).map((e) => e.name);
