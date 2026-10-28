# TasteTable

TasteTable plans a group dinner where nobody gets stuck at a place they hate. Each person lists a few movies, artists, shows, or books they love. The agent turns those into Qloo entities, pulls restaurants from the group's combined taste, then scores every restaurant against each person separately and picks the one where the least happy person is still happy. It then finds a next stop near dinner and a film the whole table would enjoy arguing about, and explains each pick to each person using the Qloo signals behind it.

Live demo: https://tastetable.graphite-site.workers.dev

The demo calls the live Qloo API (`hackathon.api.qloo.com`). The badge in the header says "Live Qloo API", and the agent trace under each result lists every request with its status. Without a Qloo key the server refuses to plan.

## Why Qloo and not just an LLM

An LLM asked "where should Mina, Leo, and Ava eat?" produces a confident list with no way to tell whether Leo actually fits. TasteTable needs a number per person per venue, and it needs that number to come from behavior data, not from the model's guess about what a Daft Punk fan eats. Qloo's Insights API gives a cross-domain affinity score (movies and music in, restaurants out) and can re-score a fixed candidate list against one person's signals. That is what makes the fairness step possible.

Averaging everyone's taste into one signal tends to pick the place the majority loves. In the "Film-club friends" preset (live run on 2026-10-29), the pooled ranking puts Little Canal first, with Mina at 78%. TasteTable picks Koneko instead, where nobody drops below 79%. With live data the gaps are small for well-known favorites: every dinner score in both presets fell between 78% and 89%, so the fairness step often acts as a tie-breaker. When the pooled pick and the fair pick differ, the results page shows both.

## How it works

```
brief text ──► LLM planner ──► price ceiling, kind of next stop
favorites  ──► GET /search (one per favorite) ──► entity IDs per person

GET /v2/insights  urn:tag            shared ambience tags for the whole group (filter.tag.types=urn:tag:ambience:qloo)
GET /v2/insights  urn:entity:place   candidates: filter.tags=urn:tag:category:place:restaurant,
                                      filter.location.query=<city>, combined signals
GET /v2/insights  urn:entity:place   per person: filter.results.entities=<candidates>,
                                      signal.interests.entities=<their IDs>, feature.explainability=true
rank by fairness = 0.6 × lowest affinity + 0.4 × mean affinity
GET /v2/insights  urn:entity:place   next stop: filter.location=POINT(<dinner lon> <dinner lat>), radius 2.5 km, then 6 km
GET /v2/insights  urn:entity:movie   film pool, then per-person scoring
LLM writer        one sentence per person per pick, from the scores and drivers only
```

A full run makes 19 to 28 Qloo calls in our live tests, which stays under the Cloudflare Workers free-plan limit of 50 subrequests. The hackathon key allows 10 requests per second, so the client starts at most 8 per second and retries a 429 up to twice. The agent trace at the bottom of the results lists every call with its parameters and status.

The LLM never ranks anything. It reads the brief to set a price ceiling and the next-stop kind, and it writes the explanations from a JSON evidence object. If no LLM key is set, a rule-based parser and a sentence template take over.

## Code map

| Path | What it does |
| --- | --- |
| `lib/qloo/client.ts` | The only place that talks to Qloo. Calls `https://hackathon.api.qloo.com` with `X-Api-Key`, throttles to 8 requests per second, retries 429. Uses the mock only when `QLOO_MOCK=1`. |
| `lib/qloo/mock.ts` | Deterministic mock of `/search`, `/v2/tags`, `/v2/insights` for tests, shaped like the live responses. |
| `lib/qloo/fixtures.ts` | Hand-written test catalog: 31 input entities and 24 fictional New York venues. |
| `lib/agent.ts` | The agent: resolve, plan, fetch candidates, score per person, rank, explain. |
| `lib/llm.ts` | OpenAI-compatible chat call. Gemini `gemini-3.1-flash-lite` by default, `gemini-3.5-flash-lite` when the first model returns 429. |
| `worker/index.ts` | Cloudflare Worker: `/api/plan`, `/api/health`, static assets. |
| `app/` | Next.js static export for the UI. |
| `scripts/check-qloo.ts` | Calls the live API, prints the response shapes the app depends on, and fails if one changes. |

## Run it

```bash
npm install
npm test                 # agent tests against the mock (sets QLOO_MOCK=1)
npm run build:static     # Next.js static export to out/
npx wrangler dev --port 3103
```

With a Qloo key:

```bash
QLOO_API_KEY="..." node scripts/check-qloo.ts --agent
```

Deploy to Cloudflare Workers:

```bash
npm run deploy
./scripts/set-secrets.sh   # reads both keys from the macOS keychain
./scripts/smoke.sh         # expects "qloo":"live" and non-2xx 0
```

| Variable | Required | Default |
| --- | --- | --- |
| `QLOO_API_KEY` | Yes. Without it `/api/plan` returns an error. | none |
| `QLOO_MOCK` | No. `1` uses the test fixtures instead of the API. | unset |
| `QLOO_BASE_URL` | No | `https://hackathon.api.qloo.com` |
| `LLM_API_KEY` | No. Without it the app uses rules and templates. | none |
| `LLM_BASE_URL` | No | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `LLM_MODEL` | No | `gemini-3.1-flash-lite` |
| `LLM_FALLBACK_MODELS` | No. Comma-separated, tried on 429. | `gemini-3.5-flash-lite` |

## Live API notes

Checked against `hackathon.api.qloo.com` on 2026-10-29 with `scripts/check-qloo.ts`. Per Qloo's hackathon FAQ, API responses are not stored in this repository; the test fixtures are hand-written.

- `/search` returns `results` as an array. Each entity has `types[]` but no `subtype`. Without a `types` filter, short titles such as "Chef" or "The Bear" match a place or an album, so the agent limits search to movies, artists, TV shows, books, video games, and podcasts.
- Per-result affinity is in `query.affinity`. There is no top-level `affinity`.
- `query.explainability` is `{ "signal.interests.entities": [{ entity_id, score }] }`, with scores that add up to 1.
- `filter.location` rejects an entity ID with 400 ("No shapes were found"). A WKT point, `POINT(lon lat)`, works, and each result then has `query.distance` in meters.
- `urn:tag:category:place:music_venue` returns nothing. The agent uses `urn:tag:category:place:live_music_venue`.
- Place results carry `properties.address`, `price_level` (1 to 4, sometimes missing), `business_rating`, `short_description`, and `location { lat, lon }`. Results without a price level are often malls or neighborhoods, so the dinner pool drops them when at least five priced places remain.
- Errors come back as `{ "errors": [{ "message", "path" }] }`.
- Rate limit headers: `x-second-ratelimit-limit: 10`, plus a monthly limit.

## License

MIT
