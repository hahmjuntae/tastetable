import assert from "node:assert/strict";
import test from "node:test";
import { chainEvidence, checkForMeal, detectMeal, mealExcludeTags, splitForMeal } from "../lib/meal.ts";
import type { QlooEntity } from "../lib/qloo/types.ts";

// 실제 insights 응답에서 판별에 쓰는 필드만 남긴 픽스처 근거
const place = (name: string, primary: string, tags: string[], props: Record<string, unknown> = {}): QlooEntity => ({
  name,
  entity_id: `live-${name}`,
  properties: { primary_genre: { id: `urn:tag:genre:place:${primary}` }, ...props },
  tags: tags.map((t) => ({ id: `urn:tag:${t}`, name: t.split(":").pop()!, type: `urn:tag:${t.split(":").slice(0, -1).join(":")}` })),
});

const koneko = place("Koneko", "cat_cafe", ["genre:place:restaurant", "genre:place:cat_cafe", "category:place:cat_cafe", "category:place:restaurant", "culinary_style:qloo:cafe"], { website: "http://konekonyc.com/" });
const subway = place("Subway", "restaurant:sandwich_shop", ["genre:place:restaurant:sandwich_shop", "genre:place:restaurant:fast_food", "category:place:fast_food_restaurant", "culinary_style:qloo:fast_food", "visit_intent:qloo:convenience_stop"], { loyalty_program: "Sub Club", website: "https://restaurants.subway.com/united-states/ny/new-york/112" });
const burgerKing = place("Burger King", "restaurant:fast_food", ["genre:place:restaurant:fast_food", "decor:qloo:standardized_fast_food_interior", "dining_options:place:dinner"], { loyalty_program: "Royal Perks", website: "https://burgerking.com/store-locator/store/2446" });
const robertas = place("Roberta's", "restaurant:pizza", ["genre:place:restaurant:pizza", "category:place:pizza_restaurant", "dining_options:place:dinner", "cuisine:qloo:bakery"], { website: "https://www.robertaspizza.com/" });
const pdt = place("Please Don't Tell", "restaurant:cocktail_bar", ["category:place:cocktail_bar", "category:place:restaurant", "time_of_day_fit:qloo:evening"], { website: "http://www.pdtnyc.com/" });
const granTorino = place("Gran Torino", "restaurant", ["category:place:cafe", "category:place:restaurant", "dining_options:place:dinner"], { website: "http://grantorinonyc.com/" });
const bamCafe = place("BAMcafé", "restaurant:cafe", ["category:place:cafe", "genre:place:restaurant:cafe", "dining_options:place:dinner"]);
const littleCanal = place("Little Canal", "restaurant", ["category:place:coffee_shop", "category:place:restaurant", "dining_options:place:dinner"]);
const remedy = place("Remedy Diner", "restaurant:diner", ["visit_intent:qloo:convenience_stop", "category:place:restaurant"], { loyalty_program: "Remedy Diner Rewards", website: "https://remedydinerny.com/" });
const hardRock = place("Hard Rock Cafe", "restaurant:american", ["category:place:american_restaurant", "category:place:restaurant", "visit_intent:qloo:destination"], { loyalty_program: "Unity", website: "https://cafe.hardrock.com/new-york/#utm_source=Google", geocode: { city: "New York" } });
const robertasCity = place("Roberta's", "restaurant:pizza", ["dining_options:place:dinner"], { website: "https://www.robertaspizza.com/", geocode: { city: "New York" } });
const cerveceria = place("Cerveceria Havemeyer", "restaurant:mexican", ["category:place:restaurant"]);

test("detectMeal reads the meal from the brief and defaults to dinner", () => {
  assert.equal(detectMeal("Saturday dinner, not too pricey, then drinks somewhere close"), "dinner");
  assert.equal(detectMeal("Sunday brunch with the team"), "brunch");
  assert.equal(detectMeal("Quick lunch near the office"), "lunch");
  assert.equal(detectMeal("Birthday, we can splurge"), "dinner");
});

test("dinner exclude tags cover cat cafes, fast food and coffee shops but breakfast allows cafes", () => {
  const dinner = mealExcludeTags("dinner");
  for (const t of ["genre:place:cat_cafe", "genre:place:restaurant:fast_food", "category:place:fast_food_restaurant", "category:place:coffee_shop"]) assert.ok(dinner.includes(`urn:tag:${t}`), t);
  assert.ok(!mealExcludeTags("breakfast").includes("urn:tag:category:place:coffee_shop"));
});

test("live non-meal places are dropped for dinner", () => {
  for (const e of [koneko, subway, burgerKing, littleCanal, bamCafe]) assert.equal(checkForMeal(e, "dinner").tier, "drop", e.name);
});

test("chain evidence needs two independent Qloo signals", () => {
  assert.deepEqual(chainEvidence(subway), ["loyalty program", "branch-page website", "known chain name"]);
  assert.deepEqual(chainEvidence(hardRock), ["loyalty program", "branch-page website"]);
  assert.equal(checkForMeal(hardRock, "dinner").tier, "drop");
  assert.ok(chainEvidence(burgerKing).length >= 3);
  // 단독 근거 하나는 체인 판정 불가
  assert.deepEqual(chainEvidence(remedy), ["loyalty program"]);
  assert.notEqual(checkForMeal(remedy, "dinner").tier, "drop");
  assert.deepEqual(chainEvidence(cerveceria, 2), ["name repeats in results"]);
});

test("restaurants that serve dinner stay, cocktail bars without a dinner tag fall back", () => {
  assert.equal(checkForMeal(robertas, "dinner").tier, "meal");
  assert.equal(checkForMeal(granTorino, "dinner").tier, "meal");
  assert.equal(checkForMeal(cerveceria, "dinner").tier, "meal");
  assert.equal(checkForMeal(pdt, "dinner").tier, "weak");
});

test("branch suffixes count as the same name", () => {
  const eataly = place("Eataly", "gourmet_grocery_store", ["dining_options:place:dinner"], { website: "https://www.eataly.com/us_en/stores/nyc-downtown" });
  const flatiron = { ...place("Eataly - Flatiron", "restaurant", ["dining_options:place:dinner"], { website: "https://www.eataly.com/us_en/stores/nyc-flatiron" }), entity_id: "live-eataly-flatiron" };
  const s = splitForMeal([eataly, flatiron, robertasCity], "dinner");
  assert.deepEqual(s.dropped.map((d) => d.entity.name), ["Eataly", "Eataly - Flatiron"]);
  const single = splitForMeal([eataly, robertasCity], "dinner");
  assert.deepEqual(single.weak.map((e) => e.name), ["Eataly"], "a grocery store with a dinner tag still ranks after restaurants");
  assert.deepEqual(s.meal.map((e) => e.name), ["Roberta's"]);
});

test("splitForMeal keeps Qloo order inside each tier", () => {
  const s = splitForMeal([koneko, pdt, robertas, subway, cerveceria, granTorino], "dinner");
  assert.deepEqual(s.meal.map((e) => e.name), ["Roberta's", "Cerveceria Havemeyer", "Gran Torino"]);
  assert.deepEqual(s.weak.map((e) => e.name), ["Please Don't Tell"]);
  assert.deepEqual(s.dropped.map((d) => d.entity.name), ["Koneko", "Subway"]);
});

test("a cafe is fine for brunch but not for dinner", () => {
  assert.equal(checkForMeal(bamCafe, "brunch").tier, "meal");
  assert.equal(checkForMeal(bamCafe, "dinner").tier, "drop");
});
