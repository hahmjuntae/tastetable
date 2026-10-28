// 손으로 만든 목 카탈로그, 장소 이름은 가상이고 태그 ID는 예시용

export type Dim =
  | "arthouse" | "dark_comedy" | "korean" | "japanese" | "latin" | "italian"
  | "retro" | "whimsical" | "cozy" | "lively" | "moody" | "late_night"
  | "jazz" | "electronic" | "indie_rock" | "literary" | "scifi" | "food_obsessed"
  | "spicy" | "vegetarian" | "natural_wine" | "cocktails" | "live_music";

export const DIM_TAGS: Record<Dim, { id: string; name: string; type: string }> = {
  arthouse: { id: "urn:tag:genre:media:arthouse", name: "Arthouse", type: "urn:tag:genre:media" },
  dark_comedy: { id: "urn:tag:genre:media:dark_comedy", name: "Dark Comedy", type: "urn:tag:genre:media" },
  korean: { id: "urn:tag:keyword:culture:korean", name: "Korean", type: "urn:tag:keyword:culture" },
  japanese: { id: "urn:tag:keyword:culture:japanese", name: "Japanese", type: "urn:tag:keyword:culture" },
  latin: { id: "urn:tag:keyword:culture:latin", name: "Latin", type: "urn:tag:keyword:culture" },
  italian: { id: "urn:tag:keyword:culture:italian", name: "Italian", type: "urn:tag:keyword:culture" },
  retro: { id: "urn:tag:keyword:style:retro", name: "Retro", type: "urn:tag:keyword:style" },
  whimsical: { id: "urn:tag:keyword:style:whimsical", name: "Whimsical", type: "urn:tag:keyword:style" },
  cozy: { id: "urn:tag:keyword:style:cozy", name: "Cozy", type: "urn:tag:keyword:style" },
  lively: { id: "urn:tag:keyword:style:lively", name: "Lively", type: "urn:tag:keyword:style" },
  moody: { id: "urn:tag:keyword:style:moody", name: "Moody", type: "urn:tag:keyword:style" },
  late_night: { id: "urn:tag:keyword:style:late_night", name: "Late Night", type: "urn:tag:keyword:style" },
  jazz: { id: "urn:tag:genre:music:jazz", name: "Jazz", type: "urn:tag:genre:music" },
  electronic: { id: "urn:tag:genre:music:electronic", name: "Electronic", type: "urn:tag:genre:music" },
  indie_rock: { id: "urn:tag:genre:music:indie_rock", name: "Indie Rock", type: "urn:tag:genre:music" },
  literary: { id: "urn:tag:keyword:style:literary", name: "Literary", type: "urn:tag:keyword:style" },
  scifi: { id: "urn:tag:genre:media:science_fiction", name: "Science Fiction", type: "urn:tag:genre:media" },
  food_obsessed: { id: "urn:tag:keyword:media:food", name: "Food Culture", type: "urn:tag:keyword:media" },
  spicy: { id: "urn:tag:offerings:place:spicy", name: "Spicy", type: "urn:tag:offerings:place" },
  vegetarian: { id: "urn:tag:offerings:place:vegetarian", name: "Vegetarian Friendly", type: "urn:tag:offerings:place" },
  natural_wine: { id: "urn:tag:offerings:place:natural_wine", name: "Natural Wine", type: "urn:tag:offerings:place" },
  cocktails: { id: "urn:tag:offerings:place:cocktails", name: "Craft Cocktails", type: "urn:tag:offerings:place" },
  live_music: { id: "urn:tag:amenity:place:live_music", name: "Live Music", type: "urn:tag:amenity:place" },
};

export const CATEGORY_TAGS = {
  restaurant: { id: "urn:tag:category:place:restaurant", name: "Restaurant", type: "urn:tag:category:place" },
  bar: { id: "urn:tag:category:place:bar", name: "Bar", type: "urn:tag:category:place" },
  music_venue: { id: "urn:tag:category:place:music_venue", name: "Music Venue", type: "urn:tag:category:place" },
  dessert: { id: "urn:tag:category:place:dessert_shop", name: "Dessert Shop", type: "urn:tag:category:place" },
  cinema: { id: "urn:tag:category:place:movie_theater", name: "Movie Theater", type: "urn:tag:category:place" },
} as const;

export type Category = keyof typeof CATEGORY_TAGS;

export type MockEntity = {
  id: string;
  name: string;
  subtype: string;
  dims: Dim[];
  popularity: number;
  aliases?: string[];
  place?: {
    hood: string;
    lat: number;
    lon: number;
    price: number;
    rating: number;
    categories: Category[];
    blurb: string;
  };
};

const M = "urn:entity:movie";
const A = "urn:entity:artist";
const T = "urn:entity:tv_show";
const B = "urn:entity:book";
const G = "urn:entity:videogame";
const P = "urn:entity:place";

const HOODS = {
  williamsburg: { hood: "Williamsburg", lat: 40.7081, lon: -73.9571 },
  carroll: { hood: "Carroll Gardens", lat: 40.6795, lon: -73.9991 },
  eastVillage: { hood: "East Village", lat: 40.7265, lon: -73.9815 },
  fortGreene: { hood: "Fort Greene", lat: 40.6892, lon: -73.9742 },
  bushwick: { hood: "Bushwick", lat: 40.6944, lon: -73.9213 },
  greenpoint: { hood: "Greenpoint", lat: 40.7305, lon: -73.9515 },
  les: { hood: "Lower East Side", lat: 40.715, lon: -73.9843 },
  cobble: { hood: "Cobble Hill", lat: 40.686, lon: -73.9962 },
  sunset: { hood: "Sunset Park", lat: 40.6455, lon: -74.0124 },
};

type Hood = keyof typeof HOODS;

function place(
  id: string, name: string, hood: Hood, dims: Dim[], price: number, rating: number,
  categories: Category[], blurb: string, jitter: [number, number] = [0, 0],
): MockEntity {
  const h = HOODS[hood];
  return {
    id, name, subtype: P, dims, popularity: Math.min(0.99, 0.5 + rating / 10),
    place: { hood: h.hood, lat: h.lat + jitter[0], lon: h.lon + jitter[1], price, rating, categories, blurb },
  };
}

export const CATALOG: MockEntity[] = [
  { id: "MOCK-MOVIE-PARASITE", name: "Parasite", subtype: M, dims: ["korean", "dark_comedy", "arthouse", "moody"], popularity: 0.99 },
  { id: "MOCK-MOVIE-GRAND-BUDAPEST", name: "The Grand Budapest Hotel", subtype: M, dims: ["retro", "whimsical", "arthouse", "dark_comedy"], popularity: 0.98, aliases: ["grand budapest"] },
  { id: "MOCK-MOVIE-SPIRITED-AWAY", name: "Spirited Away", subtype: M, dims: ["japanese", "whimsical", "cozy"], popularity: 0.99 },
  { id: "MOCK-MOVIE-MAD-MAX", name: "Mad Max: Fury Road", subtype: M, dims: ["lively", "scifi", "spicy"], popularity: 0.98, aliases: ["mad max"] },
  { id: "MOCK-MOVIE-BEFORE-SUNRISE", name: "Before Sunrise", subtype: M, dims: ["literary", "moody", "arthouse", "natural_wine"], popularity: 0.95 },
  { id: "MOCK-MOVIE-BLADE-RUNNER-2049", name: "Blade Runner 2049", subtype: M, dims: ["scifi", "electronic", "moody", "late_night"], popularity: 0.98, aliases: ["blade runner"] },
  { id: "MOCK-MOVIE-CHEF", name: "Chef", subtype: M, dims: ["food_obsessed", "latin", "lively", "spicy"], popularity: 0.93 },
  { id: "MOCK-MOVIE-LOST-IN-TRANSLATION", name: "Lost in Translation", subtype: M, dims: ["japanese", "moody", "late_night", "cocktails"], popularity: 0.96 },
  { id: "MOCK-MOVIE-PAST-LIVES", name: "Past Lives", subtype: M, dims: ["korean", "literary", "moody", "arthouse"], popularity: 0.94 },
  { id: "MOCK-MOVIE-PATERSON", name: "Paterson", subtype: M, dims: ["literary", "cozy", "arthouse"], popularity: 0.88 },
  { id: "MOCK-MOVIE-EEAAO", name: "Everything Everywhere All at Once", subtype: M, dims: ["scifi", "dark_comedy", "whimsical", "lively"], popularity: 0.99 },
  { id: "MOCK-MOVIE-IN-THE-MOOD", name: "In the Mood for Love", subtype: M, dims: ["retro", "moody", "late_night", "arthouse"], popularity: 0.93 },
  { id: "MOCK-MOVIE-RATATOUILLE", name: "Ratatouille", subtype: M, dims: ["food_obsessed", "whimsical", "cozy", "italian"], popularity: 0.99 },
  { id: "MOCK-MOVIE-DRIVE-MY-CAR", name: "Drive My Car", subtype: M, dims: ["japanese", "literary", "moody", "arthouse"], popularity: 0.9 },
  { id: "MOCK-MOVIE-WHIPLASH", name: "Whiplash", subtype: M, dims: ["jazz", "lively", "moody"], popularity: 0.98 },

  { id: "MOCK-ARTIST-RADIOHEAD", name: "Radiohead", subtype: A, dims: ["indie_rock", "moody", "electronic"], popularity: 0.98 },
  { id: "MOCK-ARTIST-NORAH-JONES", name: "Norah Jones", subtype: A, dims: ["jazz", "cozy", "natural_wine"], popularity: 0.95 },
  { id: "MOCK-ARTIST-BAD-BUNNY", name: "Bad Bunny", subtype: A, dims: ["latin", "lively", "late_night"], popularity: 0.99 },
  { id: "MOCK-ARTIST-DAFT-PUNK", name: "Daft Punk", subtype: A, dims: ["electronic", "lively", "retro"], popularity: 0.98 },
  { id: "MOCK-ARTIST-PHOEBE-BRIDGERS", name: "Phoebe Bridgers", subtype: A, dims: ["indie_rock", "moody", "literary"], popularity: 0.93 },
  { id: "MOCK-ARTIST-MILES-DAVIS", name: "Miles Davis", subtype: A, dims: ["jazz", "late_night", "retro", "cocktails"], popularity: 0.97 },
  { id: "MOCK-ARTIST-BTS", name: "BTS", subtype: A, dims: ["korean", "lively", "electronic"], popularity: 0.99 },
  { id: "MOCK-ARTIST-FLEETWOOD-MAC", name: "Fleetwood Mac", subtype: A, dims: ["retro", "indie_rock", "cozy"], popularity: 0.97 },
  { id: "MOCK-ARTIST-SAKAMOTO", name: "Ryuichi Sakamoto", subtype: A, dims: ["japanese", "electronic", "arthouse"], popularity: 0.9, aliases: ["sakamoto"] },
  { id: "MOCK-ARTIST-KENDRICK", name: "Kendrick Lamar", subtype: A, dims: ["lively", "literary", "late_night"], popularity: 0.99 },

  { id: "MOCK-TV-THE-BEAR", name: "The Bear", subtype: T, dims: ["food_obsessed", "lively", "italian", "spicy"], popularity: 0.97 },
  { id: "MOCK-TV-SEVERANCE", name: "Severance", subtype: T, dims: ["scifi", "moody", "dark_comedy"], popularity: 0.96 },
  { id: "MOCK-TV-FLEABAG", name: "Fleabag", subtype: T, dims: ["dark_comedy", "literary", "cocktails"], popularity: 0.95 },
  { id: "MOCK-BOOK-NORWEGIAN-WOOD", name: "Norwegian Wood", subtype: B, dims: ["japanese", "literary", "moody", "jazz"], popularity: 0.92 },
  { id: "MOCK-BOOK-KITCHEN-CONFIDENTIAL", name: "Kitchen Confidential", subtype: B, dims: ["food_obsessed", "late_night", "spicy"], popularity: 0.9 },
  { id: "MOCK-GAME-STARDEW", name: "Stardew Valley", subtype: G, dims: ["cozy", "whimsical", "vegetarian"], popularity: 0.96 },

  place("MOCK-PLACE-HAN-RIVER", "Han River Supper Club", "williamsburg", ["korean", "spicy", "lively", "late_night", "natural_wine"], 3, 4.6, ["restaurant"], "Modern Korean small plates and a long natural-wine list."),
  place("MOCK-PLACE-NONNA-WES", "Nonna Wes", "carroll", ["italian", "retro", "whimsical", "cozy"], 2, 4.5, ["restaurant"], "Pastel dining room, handmade pasta, red-sauce classics."),
  place("MOCK-PLACE-KISSA-MIDNIGHT", "Kissa Midnight", "eastVillage", ["japanese", "jazz", "late_night", "moody", "cocktails"], 3, 4.7, ["restaurant"], "Izakaya plates under a wall of jazz records."),
  place("MOCK-PLACE-GREEN-SIGNAL", "Green Signal Canteen", "fortGreene", ["vegetarian", "cozy", "literary", "natural_wine"], 2, 4.4, ["restaurant"], "Seasonal vegetable plates, shelves of cookbooks."),
  place("MOCK-PLACE-FUEGO-LENTO", "Taqueria Fuego Lento", "bushwick", ["latin", "spicy", "lively", "food_obsessed"], 1, 4.5, ["restaurant"], "Wood-fired tacos and a loud back patio."),
  place("MOCK-PLACE-PROJECTIONIST", "The Projectionist", "greenpoint", ["arthouse", "retro", "cocktails", "dark_comedy", "moody"], 2, 4.3, ["restaurant"], "Bistro inside a former film lab, cult films on the back wall."),
  place("MOCK-PLACE-NEON-NOODLE", "Neon Noodle Lab", "les", ["japanese", "electronic", "scifi", "late_night", "spicy"], 2, 4.4, ["restaurant"], "Ramen counter with a synth soundtrack, open late."),
  place("MOCK-PLACE-MARGIN-NOTES", "Margin Notes", "cobble", ["literary", "natural_wine", "cozy", "jazz", "vegetarian"], 3, 4.6, ["restaurant"], "Wine bar and kitchen with a lending library."),
  place("MOCK-PLACE-BODEGA-DISCO", "Bodega Disco", "bushwick", ["lively", "latin", "electronic", "cocktails", "late_night"], 2, 4.2, ["restaurant"], "Caribbean plates, mirror ball, DJ from ten."),
  place("MOCK-PLACE-COPPER-POT", "Copper Pot Brasserie", "williamsburg", ["food_obsessed", "retro", "italian", "lively"], 4, 4.7, ["restaurant"], "Chef's counter brasserie, tasting menu on weekends."),
  place("MOCK-PLACE-SEOUL-GARDEN", "Seoul Garden Veg", "sunset", ["korean", "vegetarian", "cozy", "spicy"], 1, 4.3, ["restaurant"], "Temple-food inspired Korean, all vegetarian."),
  place("MOCK-PLACE-STATIC-SMOKE", "Static & Smoke", "williamsburg", ["lively", "indie_rock", "live_music", "spicy"], 2, 4.2, ["restaurant", "music_venue"], "Barbecue hall with a small stage.", [0.002, 0.003]),

  place("MOCK-PLACE-BLUE-HOUR", "Blue Hour Listening Room", "eastVillage", ["jazz", "late_night", "moody", "cocktails"], 3, 4.7, ["bar"], "Hi-fi listening bar, records only.", [0.002, -0.001]),
  place("MOCK-PLACE-TAPE-DECK", "Tape Deck Karaoke", "williamsburg", ["lively", "korean", "retro", "late_night"], 2, 4.4, ["bar"], "Private karaoke rooms with K-pop and 80s catalogs.", [-0.002, 0.002]),
  place("MOCK-PLACE-REEL-ROOM", "Reel Room Microcinema", "greenpoint", ["arthouse", "scifi", "dark_comedy", "cocktails"], 2, 4.6, ["bar", "cinema"], "Forty-seat cinema bar with midnight cult screenings.", [0.001, 0.002]),
  place("MOCK-PLACE-AFTERWORD", "Afterword Bookshop Bar", "cobble", ["literary", "cozy", "natural_wine", "jazz"], 2, 4.5, ["bar"], "Used books in front, wine bar in back.", [0.001, -0.002]),
  place("MOCK-PLACE-PULSE-ARCADE", "Pulse Arcade Bar", "bushwick", ["electronic", "retro", "lively", "scifi"], 1, 4.3, ["bar"], "Pinball, rhythm games, cheap pitchers.", [0.002, 0.001]),
  place("MOCK-PLACE-CELLAR-DOOR", "Cellar Door Jazz", "carroll", ["jazz", "retro", "cozy", "cocktails"], 2, 4.5, ["bar", "music_venue"], "Basement trio sets Thursday to Sunday.", [-0.001, 0.002]),
  place("MOCK-PLACE-LOUD-LIBRARY", "Loud Library", "williamsburg", ["indie_rock", "live_music", "moody", "lively"], 2, 4.4, ["bar", "music_venue"], "Two-hundred-cap room for indie bands.", [0.003, -0.002]),
  place("MOCK-PLACE-MEZCAL-VINYL", "Mezcal & Vinyl", "bushwick", ["latin", "cocktails", "retro", "late_night"], 2, 4.4, ["bar"], "Mezcal flights and a crate-digger DJ.", [-0.002, -0.002]),
  place("MOCK-PLACE-MATCHA-NIGHT", "Matcha Night Market", "les", ["japanese", "whimsical", "vegetarian", "cozy"], 1, 4.3, ["dessert"], "Soft-serve, taiyaki, late tea.", [0.001, 0.002]),
  place("MOCK-PLACE-SUGAR-STATIC", "Sugar Static", "williamsburg", ["retro", "whimsical", "lively", "cozy"], 1, 4.2, ["dessert"], "Malt shop with a jukebox.", [-0.001, -0.003]),
  place("MOCK-PLACE-NIGHT-OWL", "Night Owl Bakery", "fortGreene", ["cozy", "literary", "vegetarian", "late_night"], 1, 4.4, ["dessert"], "Pie by the slice until 1am.", [0.002, 0.002]),
  place("MOCK-PLACE-LAMPLIGHT", "Lamplight Cinema", "carroll", ["arthouse", "retro", "cozy", "whimsical"], 2, 4.5, ["cinema"], "Two-screen repertory house with dinner service.", [0.002, -0.002]),
];

export const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));
