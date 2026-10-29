import type { QlooEntity } from "./qloo/types.ts";

// 식사 계획용 장소 판별, 실제 insights 응답의 태그와 properties 근거

export type Meal = "dinner" | "lunch" | "brunch" | "breakfast";

export type MealTier = "meal" | "weak" | "drop";

export type MealCheck = { tier: MealTier; reasons: string[] };

export function detectMeal(brief: string): Meal {
  const b = brief.toLowerCase();
  if (/\bbrunch\b/.test(b)) return "brunch";
  if (/\bbreakfast\b/.test(b)) return "breakfast";
  if (/\blunch(eon)?\b/.test(b)) return "lunch";
  return "dinner";
}

const T = (s: string) => `urn:tag:${s}`;

// 끼니와 무관한 비식사 장소, Koneko cat_cafe 와 Subway fast_food 응답 근거
const ALWAYS_EXCLUDE = [
  "genre:place:restaurant:fast_food",
  "category:place:fast_food_restaurant",
  "genre:place:cat_cafe",
  "category:place:cat_cafe",
  "category:place:dessert_shop",
  "category:place:ice_cream_shop",
].map(T);

// 커피 위주 장소는 아침 외 끼니에서 제외, 아침은 카페 허용 기준
const COFFEE = ["category:place:coffee_shop", "genre:place:restaurant:coffee_shop"].map(T);
const BAKERY = ["category:place:bakery", "genre:place:restaurant:bakery"].map(T);
const MEAL_EXCLUDE: Record<Meal, string[]> = { dinner: [...COFFEE, ...BAKERY], lunch: [...COFFEE, ...BAKERY], brunch: COFFEE, breakfast: [] };

// 저녁 식당 겸 카페는 저녁 태그로 구분, Gran Torino 와 BAMcafe 응답 근거
const CAFE = ["category:place:cafe", "genre:place:restaurant:cafe", "culinary_style:qloo:cafe"].map(T);

// Qloo filter.exclude.tags 값, 하나라도 붙은 장소는 API 단계 제외 대상
export function mealExcludeTags(meal: Meal): string[] {
  return [...ALWAYS_EXCLUDE, ...MEAL_EXCLUDE[meal]];
}

const GENRE = "urn:tag:genre:place:";

// 술이 주력인 primary_genre, 끼니 태그 없으면 후순위 대상
const DRINK_FIRST = new Set(
  ["restaurant:bar", "restaurant:cocktail_bar", "restaurant:lounge_bar", "restaurant:sports_bar", "restaurant:wine_bar", "restaurant:pub", "restaurant:beer_garden", "restaurant:brewery", "bar", "night_club", "live_music_venue"].map((g) => GENRE + g),
);

// 앉아서 먹기 어려운 간편식 primary_genre, 저녁 태그 없으면 후순위 대상
const GRAB_AND_GO = new Set(["restaurant:sandwich_shop", "restaurant:deli", "restaurant:takeout", "restaurant:pizza_takeout", "restaurant:delivery", "restaurant:food_court"].map((g) => GENRE + g));

// 보조 근거 전용, 단독으로는 체인 판정 불가
const KNOWN_CHAIN_NAMES = new Set(["subway", "mcdonald's", "burger king", "wendy's", "taco bell", "kfc", "starbucks", "dunkin'", "chipotle mexican grill", "panera bread", "domino's", "papa john's", "pizza hut", "popeyes louisiana kitchen", "five guys", "chick-fil-a"]);

const tagIds = (e: QlooEntity) => new Set((e.tags ?? []).map((t) => t.id));

export function primaryGenre(e: QlooEntity): string | null {
  const g = e.properties?.primary_genre;
  return g && typeof g === "object" && typeof (g as { id?: unknown }).id === "string" ? (g as { id: string }).id : null;
}

export const normName = (name: string) => name.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();

// Eataly - Flatiron 처럼 지점 접미사를 뗀 이름, 이름 반복 집계 기준
export const baseName = (name: string) => normName(name).replace(/\s+[-–—|(].*$/, "").trim();

// restaurants.subway.com 이나 /store-locator/ 같은 지점 찾기형 주소 기준
const STORE_LOCATOR = /\/\/(restaurants|locations|stores|order)\.[^/]+\/|\/(store-locator|stores?|locations?|restaurants)\/[^/]+/i;

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// cafe.hardrock.com/new-york/ 처럼 경로에 도시 이름이 든 지점 페이지 근거
function isLocationPage(e: QlooEntity): boolean {
  const site = e.properties?.website;
  if (typeof site !== "string") return false;
  if (STORE_LOCATOR.test(site)) return true;
  let path: string;
  try {
    path = new URL(site).pathname.toLowerCase();
  } catch {
    return false;
  }
  const city = e.properties?.geocode?.city;
  if (typeof city !== "string" || !city.trim()) return false;
  return [slug(city), slug(city).replace(/-/g, "")].some((s) => s.length >= 3 && path.split("/").some((seg) => seg === s || seg.startsWith(`${s}-`)));
}

// 체인 근거 목록, 두 개 이상이면 체인 판정 기준
export function chainEvidence(e: QlooEntity, nameCount = 1): string[] {
  const p = e.properties ?? {};
  const ids = tagIds(e);
  const out: string[] = [];
  if (typeof p.loyalty_program === "string" && p.loyalty_program.trim()) out.push("loyalty program");
  if (isLocationPage(e)) out.push("branch-page website");
  if (ids.has(T("decor:qloo:standardized_fast_food_interior"))) out.push("standardized interior");
  if (nameCount > 1) out.push("name repeats in results");
  if (KNOWN_CHAIN_NAMES.has(normName(e.name))) out.push("known chain name");
  return out;
}

const isFastFood = (e: QlooEntity, ids: Set<string>) =>
  primaryGenre(e) === GENRE + "restaurant:fast_food" || ids.has(T("culinary_style:qloo:fast_food")) || ids.has(T("category:place:fast_food_restaurant"));

export function checkForMeal(e: QlooEntity, meal: Meal, nameCount = 1): MealCheck {
  const ids = tagIds(e);
  const genre = primaryGenre(e);
  const reasons: string[] = [];
  const excluded = mealExcludeTags(meal).filter((t) => ids.has(t) || genre === t);
  if (excluded.length) reasons.push(`tagged ${excluded[0].replace(/^urn:tag:/, "")}`);
  else if (isFastFood(e, ids)) reasons.push("fast food");
  else if (meal === "dinner" && CAFE.some((t) => ids.has(t) || genre === t) && (!ids.has(T("dining_options:place:dinner")) || (genre !== null && CAFE.includes(genre)))) reasons.push("cafe without a dinner service");
  const chain = chainEvidence(e, nameCount);
  if (chain.length >= 2) reasons.push(`chain (${chain.join(", ")})`);
  if (reasons.length) return { tier: "drop", reasons };

  // Eataly gourmet_grocery_store 처럼 가게가 주력이면 끼니 태그가 있어도 후순위 근거
  if (genre && !genre.startsWith(GENRE + "restaurant") && /store|shop|market/.test(genre)) return { tier: "weak", reasons: [`a shop first (${genre.slice(GENRE.length)})`] };
  if (ids.has(T(`dining_options:place:${meal}`))) return { tier: "meal", reasons: [`serves ${meal}`] };
  if (genre && DRINK_FIRST.has(genre)) return { tier: "weak", reasons: [`drink-first (${genre.slice(GENRE.length)}) without a ${meal} tag`] };
  if (genre && !genre.startsWith(GENRE + "restaurant")) return { tier: "weak", reasons: [`not a restaurant (${genre.slice(GENRE.length)})`] };
  if (meal === "dinner" && genre && GRAB_AND_GO.has(genre)) return { tier: "weak", reasons: [`grab-and-go (${genre.slice(GENRE.length)}) without a dinner tag`] };
  return { tier: "meal", reasons: [] };
}

export type MealSplit = { meal: QlooEntity[]; weak: QlooEntity[]; dropped: { entity: QlooEntity; reasons: string[] }[] };

// 결합 취향 affinity 순인 Qloo 순서 유지, 단계 분리만 대상
export function splitForMeal(pool: QlooEntity[], meal: Meal): MealSplit {
  const counts = new Map<string, number>();
  for (const e of pool) counts.set(baseName(e.name), (counts.get(baseName(e.name)) ?? 0) + 1);
  const out: MealSplit = { meal: [], weak: [], dropped: [] };
  for (const e of pool) {
    const c = checkForMeal(e, meal, counts.get(baseName(e.name)) ?? 1);
    if (c.tier === "drop") out.dropped.push({ entity: e, reasons: c.reasons });
    else out[c.tier].push(e);
  }
  return out;
}

export function mergeById(...lists: QlooEntity[][]): QlooEntity[] {
  const seen = new Set<string>();
  const out: QlooEntity[] = [];
  for (const list of lists) for (const e of list) if (!seen.has(e.entity_id) && seen.add(e.entity_id)) out.push(e);
  return out;
}
