# TasteTable

TasteTable plans a group dinner where nobody gets stuck at a place they hate. Each person lists a few movies, artists, shows, or books they love. The agent turns those into Qloo entities, pulls restaurants from the group's combined taste, then scores every restaurant against each person separately and picks the one where the least happy person is still happy. It then finds a next stop near dinner and a film the whole table would enjoy arguing about, and explains each pick to each person using the Qloo signals behind it.

Live demo: https://tastetable.graphite-site.workers.dev

> The demo currently runs on hand-written mock responses (a yellow "Demo data" badge appears in the header) while the hackathon API key is pending. Setting `QLOO_API_KEY` switches every call to the live API with no other code change.

## Why Qloo and not just an LLM

An LLM asked "where should Mina, Leo, and Ava eat?" produces a confident list with no way to tell whether Leo actually fits. TasteTable needs a number per person per venue, and it needs that number to come from behavior data, not from the model's guess about what a Daft Punk fan eats. Qloo's Insights API gives a cross-domain affinity score (movies and music in, restaurants out) and can re-score a fixed candidate list against one person's signals. That is what makes the fairness step possible.

Averaging everyone's taste into one signal tends to pick the place the majority loves. In the mock demo's "Mixed crowd birthday" preset, the pooled ranking picks a jazz izakaya where the birthday guest, Sam, scores 41%. TasteTable's pick keeps everyone at 43% or higher, with Sam at 72%. These numbers come from the mock model and will change once live Qloo data is connected.

## How it works

```
brief text ──► LLM planner ──► price ceiling, kind of next stop
favorites  ──► GET /search (one per favorite) ──► entity IDs per person

GET /v2/tags              resolve tag IDs for "restaurant" and the next-stop kind
GET /v2/insights  urn:tag            shared taste tags for the whole group
GET /v2/insights  urn:entity:place   candidates from combined signals + filter.location.query
GET /v2/insights  urn:entity:place   per person: filter.results.entities=<candidates>,
                                      signal.interests.entities=<their IDs>, feature.explainability=true
rank by fairness = 0.6 × lowest affinity + 0.4 × mean affinity
GET /v2/insights  urn:entity:place   next stop: filter.location=<dinner entity ID>, radius 2.5 km, then 6 km
GET /v2/insights  urn:entity:movie   film pool, then per-person scoring
LLM writer        one sentence per person per pick, from the scores and drivers only
```

A full run makes about 20 to 40 Qloo calls, which stays under the Cloudflare Workers free-plan limit of 50 subrequests. The agent trace at the bottom of the results lists every call with its parameters and status.

The LLM never ranks anything. It reads the brief to set a price ceiling and the next-stop kind, and it writes the explanations from a JSON evidence object. If no LLM key is set, a rule-based parser and a sentence template take over.

## Code map

| Path | What it does |
| --- | --- |
| `lib/qloo/client.ts` | The only place that talks to Qloo. Uses `https://hackathon.api.qloo.com` with `X-Api-Key` when `QLOO_API_KEY` is set, otherwise calls the mock server. |
| `lib/qloo/mock.ts` | Deterministic mock of `/search`, `/v2/tags`, `/v2/insights`, shaped like the documented responses. |
| `lib/qloo/fixtures.ts` | Hand-written catalog: 31 input entities and 24 fictional New York venues. |
| `lib/agent.ts` | The agent: resolve, plan, fetch candidates, score per person, rank, explain. |
| `lib/llm.ts` | OpenAI-compatible chat call (Gemini `gemini-3.1-flash-lite` by default). |
| `worker/index.ts` | Cloudflare Worker: `/api/plan`, `/api/health`, static assets. |
| `app/` | Next.js static export for the UI. |
| `scripts/check-qloo.ts` | Calls the live API and prints the response shapes the app depends on. |

## Run it

```bash
npm install
npm test                 # mock-mode agent tests
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
printf %s "$QLOO_API_KEY" | npx wrangler secret put QLOO_API_KEY
printf %s "$LLM_API_KEY" | npx wrangler secret put LLM_API_KEY
./scripts/smoke.sh
```

| Variable | Required | Default |
| --- | --- | --- |
| `QLOO_API_KEY` | No. Without it the app uses mock data. | none |
| `QLOO_BASE_URL` | No | `https://hackathon.api.qloo.com` |
| `LLM_API_KEY` | No. Without it the app uses rules and templates. | none |
| `LLM_BASE_URL` | No | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `LLM_MODEL` | No | `gemini-3.1-flash-lite` |

## What the mock does and does not prove

The mock follows request parameters and response shapes from docs.qloo.com as of 2026-10-28. Venue names are invented and the affinity numbers come from a small tag-overlap model, so the demo shows the agent's behavior, not Qloo's data. Per Qloo's hackathon FAQ, real API responses are not stored in this repository.

Fields the app reads that the docs confirm with an example:

- `results.entities[]` with `name`, `entity_id`, `type`, `subtype`, `properties`, `popularity`, `tags[]` (`id`, `name`, `type`)
- `results.tags[]` with `tag_id`, `name`, `subtype` for `filter.type=urn:tag`
- `X-Api-Key` header, GET with query parameters, `hackathon.api.qloo.com` host

Fields and behaviors not confirmed by a documented example, read defensively and checked by `scripts/check-qloo.ts`:

- Where the per-result affinity lives: the code reads `query.affinity`, then top-level `affinity` (the Schema & Taxonomy page shows the latter).
- The inner shape of `query.explainability`. The code looks for any `{ entity_id, score }` list inside it.
- The `/search` response: assumed `results` is an array of entities.
- The `/v2/tags` response: assumed `results.tags[]` with `id`.
- Place fields `properties.address`, `properties.price_level`, `properties.business_rating`, `location`.
- Category tag IDs such as `urn:tag:category:place:restaurant`. The agent looks them up through `/v2/tags` first and only falls back to these.
- Whether place insights accept `filter.location.query`. On a 400 the agent retries with `signal.location.query`.

## License

MIT
