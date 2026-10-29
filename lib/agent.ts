import { chatJSON, llmMode, llmModel } from "./llm.ts";
import { detectMeal, mealExcludeTags, mergeById, splitForMeal, type Meal } from "./meal.ts";
import { QlooError, qlooGet, qlooMode } from "./qloo/client.ts";
import type { QlooEntity, QlooInsightsResponse, QlooParams, TraceEntry } from "./qloo/types.ts";

export type Member = { name: string; favorites: string[] };
export type PlanInput = { city: string; brief: string; members: Member[] };

export type NextStopKind = "bar" | "music venue" | "dessert" | "cinema";

export type Resolved = { query: string; entityId: string; name: string; subtype: string };

export type MemberScore = { member: string; affinity: number; drivers: string[] };

export type Pick = {
  entityId: string;
  name: string;
  description: string | null;
  address: string | null;
  priceLevel: number | null;
  rating: number | null;
  tags: string[];
  scores: MemberScore[];
  minAffinity: number;
  meanAffinity: number;
  fairness: number;
  location: { lat: number; lon: number } | null;
};

export type Story = {
  headline: string;
  dinner: Record<string, string>;
  nextStop: Record<string, string>;
  movie: string;
  source: "llm" | "template";
  model?: string;
};

export type PlanResult = {
  ok: true;
  modes: { qloo: "live" | "mock"; llm: "live" | "mock"; llmModel: string | null };
  plan: { city: string; meal: Meal; priceMax: number | null; nextStop: NextStopKind; vibe: string; source: "llm" | "rules"; model?: string };
  members: { name: string; resolved: Resolved[]; unresolved: string[] }[];
  sharedTags: { name: string; affinity: number | null }[];
  dinner: Pick;
  alternatives: Pick[];
  pooledPick: Pick | null;
  nextStop: Pick | null;
  movie: Pick | null;
  story: Story;
  notes: string[];
  trace: TraceEntry[];
};

export type PlanFailure = { ok: false; error: string; trace: TraceEntry[] };

export const LIMITS = { members: 5, favoritesPerMember: 4, favoritesTotal: 16 };

// 불행한 한 명을 막는 least misery 가중, 최솟값 우선
const FAIRNESS_MIN_WEIGHT = 0.6;

// 실제 insights 에서 결과가 나온 category 태그만 사용, 2026-10-29 확인 근거
const RESTAURANT_TAG = "urn:tag:category:place:restaurant";
const NEXT_STOP_TAG: Record<NextStopKind, string> = {
  bar: "urn:tag:category:place:bar",
  "music venue": "urn:tag:category:place:live_music_venue",
  dessert: "urn:tag:category:place:dessert_shop",
  cinema: "urn:tag:category:place:movie_theater",
};

const PLACE = "urn:entity:place";
// 장소, 앨범, 인물 동명이인 매칭 방지, 취향 입력 도메인만 허용
const SEARCH_TYPES = ["movie", "artist", "tv_show", "book", "videogame", "podcast"].map((t) => `urn:entity:${t}`).join(",");

const affinityOf = (e: QlooEntity): number | null => {
  const a = e.query?.affinity ?? e.affinity;
  return typeof a === "number" ? a : null;
};

function explainDrivers(e: QlooEntity, names: Map<string, string>): string[] {
  return (e.query?.explainability?.["signal.interests.entities"] ?? [])
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => names.get(r.entity_id))
    .filter((n): n is string => Boolean(n))
    .slice(0, 2);
}

function rulesPlan(brief: string): { priceMax: number | null; nextStop: NextStopKind; vibe: string } {
  const b = brief.toLowerCase();
  const priceMax = /cheap|budget|broke|inexpensive|affordable/.test(b) ? 2 : /splurge|fancy|special|birthday|anniversary/.test(b) ? 4 : /mid|moderate|not too pricey/.test(b) ? 3 : null;
  const nextStop: NextStopKind = /dessert|sweet|ice cream|cake/.test(b)
    ? "dessert"
    : /show|concert|gig|live music|band|jazz/.test(b)
      ? "music venue"
      : /movie|film|cinema|screening/.test(b)
        ? "cinema"
        : "bar";
  return { priceMax, nextStop, vibe: brief.trim().split(/\s+/).slice(0, 8).join(" ") || "dinner with friends" };
}

async function plan(brief: string) {
  const fallback = rulesPlan(brief);
  if (!brief.trim()) return { ...fallback, source: "rules" as const };
  const res = await chatJSON(
    [
      {
        role: "system",
        content:
          'You turn a short group-outing request into JSON: {"priceMax": 1|2|3|4|null, "nextStop": "bar"|"music venue"|"dessert"|"cinema", "vibe": string of at most 8 words}. priceMax uses Qloo price levels (1 cheapest, 4 most expensive); null if the request does not mention budget. Output JSON only.',
      },
      { role: "user", content: brief.slice(0, 500) },
    ],
    (v) => {
      const o = v as { priceMax?: unknown; nextStop?: unknown; vibe?: unknown } | null;
      if (!o) return null;
      const kinds: NextStopKind[] = ["bar", "music venue", "dessert", "cinema"];
      const nextStop = kinds.includes(o.nextStop as NextStopKind) ? (o.nextStop as NextStopKind) : fallback.nextStop;
      const p = Number(o.priceMax);
      const priceMax = Number.isInteger(p) && p >= 1 && p <= 4 ? p : null;
      const vibe = typeof o.vibe === "string" && o.vibe.trim() ? o.vibe.trim().slice(0, 60) : fallback.vibe;
      return { priceMax, nextStop, vibe };
    },
  );
  return res.ok ? { ...res.data, source: "llm" as const, model: res.model } : { ...fallback, source: "rules" as const };
}

async function insights(step: string, params: QlooParams, trace: TraceEntry[]): Promise<QlooEntity[]> {
  const body = await qlooGet<QlooInsightsResponse>(step, "/v2/insights", params, trace);
  return body.results?.entities ?? [];
}

// filter.location.query 가 400 이면 signal.location.query 로 재시도
async function placesInCity(step: string, city: string, params: QlooParams, trace: TraceEntry[]) {
  try {
    return await insights(step, { ...params, "filter.location.query": city }, trace);
  } catch (error) {
    if (error instanceof QlooError && error.status === 400) {
      return insights(`${step} (retry)`, { ...params, "signal.location.query": city }, trace);
    }
    throw error;
  }
}

type ResolvedMember = { name: string; resolved: Resolved[]; unresolved: string[] };

// 개인별 채점 대상 상한과 범위 확대 기준
const POOL_SIZE = 15;
const MIN_MEAL_POOL = 6;

const hasPrice = (e: QlooEntity) => typeof e.properties?.price_level === "number";

// 카페, 패스트푸드, 체인 제외 후 부족하면 take 확대 → 가격 상한 해제 → 술집 위주 후보 순 폴백
export async function mealPool(city: string, meal: Meal, params: QlooParams, notes: string[], trace: TraceEntry[]): Promise<QlooEntity[]> {
  let raw = await placesInCity(`${meal[0].toUpperCase()}${meal.slice(1)} candidates from combined taste`, city, params, trace);
  let split = splitForMeal(raw, meal);
  if (split.meal.length < MIN_MEAL_POOL) {
    const wider = await placesInCity(`Wider ${meal} search, ${split.meal.length} fit so far`, city, { ...params, take: 50 }, trace).catch(() => [] as QlooEntity[]);
    raw = mergeById(raw, wider);
    split = splitForMeal(raw, meal);
  }
  if (split.meal.length < MIN_MEAL_POOL && params["filter.price_level.max"] !== undefined) {
    const before = split.meal.length;
    const uncapped = await placesInCity(`Wider ${meal} search without the price cap`, city, { ...params, "filter.price_level.max": undefined, take: 50 }, trace).catch(() => [] as QlooEntity[]);
    raw = mergeById(raw, uncapped);
    split = splitForMeal(raw, meal);
    if (split.meal.length > before) notes.push(`Only ${before} ${meal} spots fit the budget, so some options may cost more.`);
  }
  // 가격 없는 결과는 쇼핑몰, 동네 이름 같은 비식당이 섞여 후순위 처리
  const priced = split.meal.filter(hasPrice);
  let pool = (priced.length >= MIN_MEAL_POOL ? priced : [...priced, ...split.meal.filter((e) => !hasPrice(e))]).slice(0, POOL_SIZE);
  if (pool.length < MIN_MEAL_POOL && split.weak.length) {
    pool = [...pool, ...split.weak].slice(0, POOL_SIZE);
    notes.push(`Few sit-down ${meal} spots came back, so bars that serve food are included too.`);
  }
  if (!pool.length) {
    notes.push(`Qloo only returned cafes, fast food or chains for ${meal} here.`);
    return split.dropped.map((d) => d.entity).slice(0, POOL_SIZE);
  }
  if (split.dropped.length) notes.push(leftOutNote(split.dropped));
  return pool;
}

const dropKind = (reasons: string[]) =>
  reasons.some((r) => r.startsWith("chain")) ? "chains" : reasons.some((r) => /fast.food/.test(r)) ? "fast food" : reasons.some((r) => /cafe|coffee|bakery|dessert|ice_cream/.test(r)) ? "cafes" : "other non-meal spots";

function leftOutNote(dropped: { entity: QlooEntity; reasons: string[] }[]): string {
  const kinds = [...new Set(dropped.map((d) => dropKind(d.reasons)))];
  const label = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}` : kinds[0];
  const names = dropped.slice(0, 3).map((d) => d.entity.name).join(", ");
  return `Left out ${label}: ${names}${dropped.length > 3 ? ` and ${dropped.length - 3} more` : ""}.`;
}

async function scoreForEach(
  label: string,
  type: string,
  candidates: QlooEntity[],
  members: ResolvedMember[],
  names: Map<string, string>,
  trace: TraceEntry[],
): Promise<Pick[]> {
  if (!candidates.length) return [];
  const ids = candidates.map((c) => c.entity_id);
  const perMember = await Promise.all(
    members.map((m) =>
      insights(
        `Score ${label} for ${m.name}`,
        {
          "filter.type": type,
          "filter.results.entities": ids.join(","),
          "signal.interests.entities": m.resolved.map((r) => r.entityId).join(","),
          "feature.explainability": true,
          take: Math.min(50, ids.length),
        },
        trace,
      ).catch(() => [] as QlooEntity[]),
    ),
  );
  return candidates.map((c) => {
    const scores: MemberScore[] = members.map((m, i) => {
      const hit = perMember[i].find((e) => e.entity_id === c.entity_id);
      const own = new Map(m.resolved.map((r) => [r.entityId, r.name]));
      const drivers = hit ? explainDrivers(hit, own) : [];
      return { member: m.name, affinity: hit ? affinityOf(hit) ?? 0 : 0, drivers };
    });
    const values = scores.map((s) => s.affinity);
    const minAffinity = Math.min(...values);
    const meanAffinity = values.reduce((a, b) => a + b, 0) / values.length;
    const props = c.properties ?? {};
    return {
      entityId: c.entity_id,
      name: c.name,
      description: typeof props.short_description === "string" ? props.short_description : typeof props.description === "string" ? props.description : null,
      address: typeof props.address === "string" ? props.address : props.geocode?.name ?? null,
      priceLevel: typeof props.price_level === "number" ? props.price_level : null,
      rating: typeof props.business_rating === "number" ? props.business_rating : null,
      tags: displayTags(c),
      scores,
      minAffinity,
      meanAffinity,
      fairness: FAIRNESS_MIN_WEIGHT * minAffinity + (1 - FAIRNESS_MIN_WEIGHT) * meanAffinity,
      location: c.location ? { lat: c.location.lat, lon: c.location.lon } : null,
    };
  });
}

// 결제 수단, 연령대, 주차 같은 운영 태그 제외, 분위기와 메뉴 태그 우선
const DISPLAY_TAG_TYPES = ["ambience:qloo", "specialty_dish:place", "menu_highlight:qloo", "culinary_style:qloo", "decor:qloo", "interests:qloo"];

function displayTags(c: QlooEntity): string[] {
  const tags = c.tags ?? [];
  const rank = (t: { type: string }) => DISPLAY_TAG_TYPES.findIndex((x) => t.type.endsWith(x));
  const preferred = tags.filter((t) => rank(t) >= 0).sort((a, b) => rank(a) - rank(b));
  const pool = preferred.length ? preferred : tags.filter((t) => !/^(Restaurant|Bar|Dessert Shop|Live Music Venue|Music Venue|Movie Theater)$/.test(t.name));
  const seen = new Set<string>();
  return pool
    .map((t) => t.name)
    .filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()))
    .slice(0, 5);
}

const byFairness = (a: Pick, b: Pick) => b.fairness - a.fairness;

function templateStory(result: Omit<PlanResult, "story">): Story {
  const shared = result.sharedTags.slice(0, 3).map((t) => t.name.toLowerCase());
  const line = (pick: Pick | null, member: string) => {
    if (!pick) return "";
    const s = pick.scores.find((x) => x.member === member);
    if (!s) return "";
    const pct = Math.round(s.affinity * 100);
    const overlap = pick.tags.filter((t) => shared.includes(t.toLowerCase())).slice(0, 2).map((t) => t.toLowerCase());
    const why = s.drivers.length ? `Qloo ties it to your taste for ${s.drivers.join(" and ")}` : "it sits close to your overall taste profile";
    return `${pct}% match: ${why}${overlap.length ? `, and it leans ${overlap.join(" and ")}` : ""}.`;
  };
  const names = result.members.map((m) => m.name);
  return {
    headline: `${result.dinner.name} works for all ${names.length} of you; nobody drops below ${Math.round(result.dinner.minAffinity * 100)}%.`,
    dinner: Object.fromEntries(names.map((n) => [n, line(result.dinner, n)])),
    nextStop: Object.fromEntries(names.map((n) => [n, line(result.nextStop, n)])),
    movie: result.movie ? `Something to argue about over dessert: ${result.movie.name}, the film the whole table scores highest on.` : "",
    source: "template",
  };
}

async function writeStory(result: Omit<PlanResult, "story">): Promise<Story> {
  const fallback = templateStory(result);
  const evidence = {
    vibe: result.plan.vibe,
    sharedTaste: result.sharedTags.map((t) => t.name),
    members: result.members.map((m) => ({ name: m.name, favorites: m.resolved.map((r) => r.name) })),
    dinner: result.dinner && { name: result.dinner.name, tags: result.dinner.tags, scores: result.dinner.scores },
    nextStop: result.nextStop && { name: result.nextStop.name, tags: result.nextStop.tags, scores: result.nextStop.scores },
    movie: result.movie && { name: result.movie.name, scores: result.movie.scores },
  };
  const names = result.members.map((m) => m.name);
  const res = await chatJSON(
    [
      {
        role: "system",
        content: [
          "You explain a group outing plan. Use only the evidence JSON: Qloo affinity scores (0-1), the favorites that drove each score (drivers), and tags.",
          "Do not invent menu items, prices, opening hours, or facts about the venues.",
          'Return JSON: {"headline": string, "dinner": {<member name>: string}, "nextStop": {<member name>: string}, "movie": string}.',
          "Each member line is one sentence under 25 words, addressed to that person as 'you', names at least one of their drivers when present, and includes their score written like 62%. Vary how the sentences start.",
          "The movie line is one sentence about why the whole table would enjoy talking about it.",
          "Headline is one sentence under 18 words that names the dinner spot. Plain, warm, specific, like a friend texting the group. No exclamation marks, no emoji.",
        ].join(" "),
      },
      { role: "user", content: JSON.stringify(evidence) },
    ],
    (v) => {
      const o = v as { headline?: unknown; dinner?: unknown; nextStop?: unknown; movie?: unknown } | null;
      if (!o || typeof o.headline !== "string") return null;
      const pickLines = (x: unknown) => {
        const rec = (x ?? {}) as Record<string, unknown>;
        return Object.fromEntries(names.map((n) => [n, typeof rec[n] === "string" ? (rec[n] as string) : ""]));
      };
      return { headline: o.headline, dinner: pickLines(o.dinner), nextStop: pickLines(o.nextStop), movie: typeof o.movie === "string" ? o.movie : "" };
    },
  );
  if (!res.ok) return fallback;
  const merge = (llm: Record<string, string>, tpl: Record<string, string>) => Object.fromEntries(names.map((n) => [n, llm[n] || tpl[n]]));
  return {
    headline: res.data.headline,
    dinner: merge(res.data.dinner, fallback.dinner),
    nextStop: merge(res.data.nextStop, fallback.nextStop),
    movie: res.data.movie || fallback.movie,
    source: "llm",
    model: res.model,
  };
}

export function sanitizeInput(raw: unknown): PlanInput | string {
  const o = raw as { city?: unknown; brief?: unknown; members?: unknown } | null;
  if (!o || typeof o !== "object") return "Request body must be JSON.";
  const city = typeof o.city === "string" ? o.city.trim().slice(0, 80) : "";
  if (!city) return "City is required.";
  const brief = typeof o.brief === "string" ? o.brief.slice(0, 500) : "";
  const members = (Array.isArray(o.members) ? o.members : [])
    .map((m) => {
      const x = m as { name?: unknown; favorites?: unknown };
      const name = typeof x?.name === "string" ? x.name.trim().slice(0, 40) : "";
      const favorites = (Array.isArray(x?.favorites) ? x.favorites : [])
        .filter((f): f is string => typeof f === "string")
        .map((f) => f.trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, LIMITS.favoritesPerMember);
      return { name, favorites };
    })
    .filter((m) => m.name && m.favorites.length)
    .slice(0, LIMITS.members);
  if (members.length < 2) return "Add at least two people, each with at least one favorite.";
  return { city, brief, members };
}

export async function runAgent(input: PlanInput): Promise<PlanResult | PlanFailure> {
  const trace: TraceEntry[] = [];
  const notes: string[] = [];
  if (qlooMode() === "off") return { ok: false, error: "The Qloo API key is not configured on this server.", trace };
  try {
    const planPromise = plan(input.brief);

    let budget = LIMITS.favoritesTotal;
    const lookups = input.members.map((m) => {
      const take = m.favorites.slice(0, Math.max(0, budget));
      budget -= take.length;
      return take;
    });
    const members: ResolvedMember[] = await Promise.all(
      input.members.map(async (m, i) => {
        const hits = await Promise.all(
          lookups[i].map((q) =>
            qlooGet<{ results?: QlooEntity[] }>(`Resolve "${q}" for ${m.name}`, "/search", { query: q, types: SEARCH_TYPES, take: 1 }, trace)
              .then((b) => ({ q, e: b.results?.[0] }))
              .catch(() => ({ q, e: undefined })),
          ),
        );
        const resolved: Resolved[] = [];
        const unresolved: string[] = [];
        const seen = new Set<string>();
        for (const h of hits) {
          if (!h.e || seen.has(h.e.entity_id)) {
            if (!h.e) unresolved.push(h.q);
            continue;
          }
          seen.add(h.e.entity_id);
          resolved.push({ query: h.q, entityId: h.e.entity_id, name: h.e.name, subtype: h.e.subtype ?? h.e.types?.[0] ?? "urn:entity" });
        }
        return { name: m.name, resolved, unresolved };
      }),
    );
    const active = members.filter((m) => m.resolved.length);
    for (const m of members) if (!m.resolved.length) notes.push(`Could not match any favorites for ${m.name}; they were left out of scoring.`);
    if (active.length < 2) return { ok: false, error: "Qloo matched favorites for fewer than two people. Try more well-known titles or artists.", trace };

    const allIds = [...new Set(active.flatMap((m) => m.resolved.map((r) => r.entityId)))];
    const names = new Map(active.flatMap((m) => m.resolved.map((r) => [r.entityId, r.name] as const)));
    const planned = await planPromise;
    const nextTag = NEXT_STOP_TAG[planned.nextStop];

    const [tagBody, moviePool] = await Promise.all([
      // 태그 타입 제한 없으면 결제, 미용실 같은 무관 태그 혼입, 분위기 태그로 제한
      qlooGet<QlooInsightsResponse>("Shared taste tags for the group", "/v2/insights", { "filter.type": "urn:tag", "filter.tag.types": "urn:tag:ambience:qloo", "signal.interests.entities": allIds.join(","), take: 8 }, trace).catch(() => ({}) as QlooInsightsResponse),
      insights("Movie pool from combined taste", { "filter.type": "urn:entity:movie", "signal.interests.entities": allIds.join(","), "filter.exclude.entities": allIds.join(","), take: 8 }, trace).catch(() => [] as QlooEntity[]),
    ]);
    const sharedTags = (tagBody.results?.tags ?? []).map((t) => ({ name: t.name, affinity: typeof t.query?.affinity === "number" ? t.query.affinity : null }));

    const meal = detectMeal(input.brief);
    const dinnerParams: QlooParams = {
      "filter.type": PLACE,
      "filter.tags": RESTAURANT_TAG,
      "filter.exclude.tags": mealExcludeTags(meal).join(","),
      "signal.interests.entities": allIds.join(","),
      "filter.price_level.max": planned.priceMax ?? undefined,
      take: 25,
    };
    const dinnerPool = await mealPool(input.city, meal, dinnerParams, notes, trace);
    if (!dinnerPool.length) return { ok: false, error: `Qloo returned no restaurants for ${input.city} with these filters.`, trace };

    const [dinnerPicks, moviePicks] = await Promise.all([
      scoreForEach("dinner", PLACE, dinnerPool, active, names, trace),
      scoreForEach("movie", "urn:entity:movie", moviePool, active, names, trace),
    ]);
    const ranked = [...dinnerPicks].sort(byFairness);
    const dinner = ranked[0];
    const pooledTop = dinnerPicks[0];
    const pooledPick = pooledTop && pooledTop.entityId !== dinner.entityId ? pooledTop : null;

    // filter.location 은 엔티티 ID 를 400 으로 거절, WKT POINT(경도 위도) 필요
    let nextPool: QlooEntity[] = [];
    const point = dinner.location ? `POINT(${dinner.location.lon} ${dinner.location.lat})` : null;
    for (const radius of point ? [2500, 6000] : []) {
      nextPool = await insights(
        `${planned.nextStop} within ${radius / 1000} km of dinner`,
        { "filter.type": PLACE, "filter.tags": nextTag, "filter.location": point!, "filter.location.radius": radius, "signal.interests.entities": allIds.join(","), "filter.exclude.entities": dinner.entityId, take: 10 },
        trace,
      ).catch(() => []);
      if (nextPool.length >= 2) break;
    }
    if (!nextPool.length) {
      nextPool = await placesInCity(`${planned.nextStop} in ${input.city}`, input.city, { "filter.type": PLACE, "filter.tags": nextTag, "signal.interests.entities": allIds.join(","), take: 10 }, trace).catch(() => []);
      if (nextPool.length) notes.push(`No ${planned.nextStop} came back near dinner, so the next stop is city-wide.`);
    }
    const nextPicks = (await scoreForEach(planned.nextStop, PLACE, nextPool, active, names, trace)).sort(byFairness);
    const moviesRanked = [...moviePicks].sort(byFairness);

    if (qlooMode() === "mock" && !/new york|nyc|brooklyn|manhattan|big apple/i.test(input.city)) {
      notes.push("Mock data only covers New York, so the venues are New York venues.");
    }

    const base: Omit<PlanResult, "story"> = {
      ok: true,
      modes: { qloo: qlooMode() === "mock" ? "mock" : "live", llm: llmMode(), llmModel: llmModel() },
      plan: { city: input.city, meal, ...planned },
      members,
      sharedTags,
      dinner,
      alternatives: ranked.slice(1, 3),
      pooledPick,
      nextStop: nextPicks[0] ?? null,
      movie: moviesRanked[0] ?? null,
      notes,
      trace,
    };
    return { ...base, story: await writeStory(base) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unexpected error", trace };
  }
}
