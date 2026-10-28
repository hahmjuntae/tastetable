"use client";

import { useEffect, useState } from "react";
import type { Pick, PlanFailure, PlanResult } from "@/lib/agent.ts";

type Person = { name: string; favorites: string };
type Health = { qloo: "live" | "mock" | "off"; llm: "live" | "mock"; llmModel: string | null; mockFavorites?: string[] };

const PRESETS: { label: string; city: string; brief: string; people: Person[] }[] = [
  {
    label: "Film-club friends",
    city: "Brooklyn, New York",
    brief: "Saturday dinner, not too pricey, then drinks somewhere close",
    people: [
      { name: "Mina", favorites: "Parasite, Norah Jones, Stardew Valley" },
      { name: "Leo", favorites: "Blade Runner 2049, Daft Punk, Severance" },
      { name: "Ava", favorites: "Before Sunrise, Phoebe Bridgers, Norwegian Wood" },
    ],
  },
  {
    label: "Mixed crowd birthday",
    city: "New York",
    brief: "Birthday dinner for Sam, we can splurge a little, end with live music",
    people: [
      { name: "Sam", favorites: "Bad Bunny, Chef, The Bear" },
      { name: "Yuki", favorites: "Spirited Away, Ryuichi Sakamoto, Lost in Translation" },
      { name: "Dre", favorites: "Miles Davis, Whiplash, Kitchen Confidential" },
      { name: "Noa", favorites: "Fleabag, Fleetwood Mac, The Grand Budapest Hotel" },
    ],
  },
];

const LOADING_STEPS = [
  "Matching everyone's favorites to Qloo entities",
  "Reading the group's shared taste tags",
  "Pulling restaurants from the combined taste signal",
  "Scoring every restaurant against each person separately",
  "Finding a next stop near dinner",
  "Writing why it fits each person",
];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const dollars = (n: number | null) => (n ? "$".repeat(n) : null);

function FitList({ pick, lines }: { pick: Pick; lines: Record<string, string> }) {
  return (
    <ul className="fits">
      {pick.scores.map((s) => (
        <li key={s.member}>
          <div className="fit-top">
            <span>{s.member}</span>
            <span>{pct(s.affinity)}</span>
          </div>
          <div className={`bar${s.affinity === pick.minAffinity ? " low" : ""}`}>
            <i style={{ width: pct(Math.max(0.02, s.affinity)) }} />
          </div>
          {lines[s.member] ? <p className="fit-why">{lines[s.member]}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function PickCard({ title, pick, lines, children }: { title: string; pick: Pick; lines: Record<string, string>; children?: React.ReactNode }) {
  const meta = [pick.address, dollars(pick.priceLevel), pick.rating ? `${pick.rating.toFixed(1)} rating` : null].filter(Boolean).join(" · ");
  return (
    <section className="card">
      <h3>{title}</h3>
      <div className="pick-head">
        <div>
          <h2>{pick.name}</h2>
          {meta ? <p className="meta">{meta}</p> : null}
        </div>
        <div className="score-badge">
          <strong>{pct(pick.minAffinity)}</strong>
          <small>lowest match at the table</small>
        </div>
      </div>
      {pick.description ? <p className="desc">{pick.description}</p> : null}
      {pick.tags.length ? (
        <div className="chips">
          {pick.tags.map((t) => (
            <span key={t} className="chip plain">{t}</span>
          ))}
        </div>
      ) : null}
      <FitList pick={pick} lines={lines} />
      {children}
    </section>
  );
}

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [city, setCity] = useState(PRESETS[0].city);
  const [brief, setBrief] = useState(PRESETS[0].brief);
  const [people, setPeople] = useState<Person[]>(PRESETS[0].people);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const id = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 700);
    return () => clearInterval(id);
  }, [loading]);

  const usePreset = (i: number) => {
    setCity(PRESETS[i].city);
    setBrief(PRESETS[i].brief);
    setPeople(PRESETS[i].people);
    setResult(null);
    setError(null);
  };

  const update = (i: number, patch: Partial<Person>) => setPeople((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          city,
          brief,
          members: people.map((p) => ({ name: p.name, favorites: p.favorites.split(",").map((f) => f.trim()).filter(Boolean) })),
        }),
      });
      const body = (await res.json()) as PlanResult | PlanFailure;
      if (body.ok) setResult(body);
      else {
        setResult(null);
        setError(body.error);
      }
    } catch {
      setError("The planner did not respond. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  const mock = health?.qloo === "mock";

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1 className="brand">
            Taste<span>Table</span>
          </h1>
          <p className="tagline">Dinner plans that work for everyone at the table, not just the loudest person.</p>
        </div>
        {health ? (
          <span className={`pill ${health.qloo === "live" ? "live" : "mock"}`} title={health.qloo === "live" ? "Every result comes from the Qloo Taste AI API" : mock ? "Local test fixtures (QLOO_MOCK=1)" : "QLOO_API_KEY is not configured"}>
            {health.qloo === "live" ? "Live Qloo API" : mock ? "Test fixtures" : "Qloo key missing"}
            {health.llm === "mock" ? " · template text" : ""}
          </span>
        ) : null}
      </header>

      <div className="grid">
        <form className="card" onSubmit={submit}>
          <h3>Try a group</h3>
          <div className="presets">
            {PRESETS.map((p, i) => (
              <button type="button" key={p.label} onClick={() => usePreset(i)}>
                {p.label}
              </button>
            ))}
          </div>

          <label htmlFor="city">City</label>
          <input id="city" value={city} onChange={(e) => setCity(e.target.value)} required />

          <label htmlFor="brief">What&apos;s the plan?</label>
          <textarea id="brief" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Friday dinner, cheap-ish, then a bar nearby" />

          <label>Who&apos;s coming, and what do they love?</label>
          {people.map((p, i) => (
            <div className="person" key={i}>
              <div className="person-row">
                <input aria-label={`Person ${i + 1} name`} value={p.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Name" />
                {people.length > 2 ? (
                  <button type="button" className="ghost" aria-label={`Remove ${p.name || "person"}`} onClick={() => setPeople((x) => x.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                ) : (
                  <span />
                )}
                <input className="fav" aria-label={`Person ${i + 1} favorites`} value={p.favorites} onChange={(e) => update(i, { favorites: e.target.value })} placeholder="Movies, artists, shows, books" list={mock ? "mock-favorites" : undefined} />
              </div>
            </div>
          ))}
          {people.length < 5 ? (
            <button type="button" style={{ marginTop: 10 }} onClick={() => setPeople((x) => [...x, { name: "", favorites: "" }])}>
              Add a person
            </button>
          ) : null}
          <p className="hint">Comma-separated. Up to 5 people and 4 favorites each.</p>
          {mock && health?.mockFavorites ? (
            <>
              <datalist id="mock-favorites">
                {health.mockFavorites.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <p className="hint">Demo mode knows: {health.mockFavorites.slice(0, 12).join(", ")}, and more.</p>
            </>
          ) : null}

          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Finding your table..." : "Find our table"}
          </button>
        </form>

        <div>
          {loading ? (
            <section className="card">
              <h3>Working</h3>
              <ul className="loading-steps">
                {LOADING_STEPS.slice(0, step + 1).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
          ) : error ? (
            <section className="card">
              <p className="error">{error}</p>
            </section>
          ) : result ? (
            <Results result={result} />
          ) : (
            <section className="card empty">
              <h2>Everyone gets a vote</h2>
              <p>
                Add what each person loves. TasteTable scores every restaurant against each person on Qloo&apos;s taste graph and picks the one where the least happy person is still happy.
              </p>
            </section>
          )}
        </div>
      </div>

      <footer>
        Built for the Qloo Agentic Hackathon. Recommendations come from the{" "}
        <a href="https://docs.qloo.com/" target="_blank" rel="noreferrer">Qloo Insights API</a>. Source on{" "}
        <a href="https://github.com/hahmjuntae/tastetable" target="_blank" rel="noreferrer">GitHub</a>.
      </footer>
    </main>
  );
}

function Results({ result }: { result: PlanResult }) {
  const { dinner, nextStop, movie, story, pooledPick } = result;
  const pooledLow = pooledPick ? pooledPick.scores.reduce((a, b) => (b.affinity < a.affinity ? b : a)) : null;
  return (
    <>
      <section className="card">
        <p className="headline">{story.headline}</p>
        {result.sharedTags.length ? (
          <>
            <h3>What this group shares</h3>
            <div className="chips">
              {result.sharedTags.map((t) => (
                <span key={t.name} className="chip">{t.name}</span>
              ))}
            </div>
          </>
        ) : null}
        {result.notes.map((n) => (
          <p key={n} className="hint">{n}</p>
        ))}
      </section>

      <PickCard title="Dinner" pick={dinner} lines={story.dinner}>
        {pooledPick && pooledLow ? (
          <p className="callout">
            Pooling everyone&apos;s taste into one signal would have picked <strong>{pooledPick.name}</strong>, where {pooledLow.member} matches only {pct(pooledLow.affinity)}.
          </p>
        ) : null}
        {result.alternatives.length ? (
          <div className="alts">
            {result.alternatives.map((a) => (
              <div key={a.entityId}>
                <span>Runner-up: {a.name}</span>
                <span>lowest {pct(a.minAffinity)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </PickCard>

      {nextStop ? <PickCard title={`After dinner: ${result.plan.nextStop}`} pick={nextStop} lines={story.nextStop} /> : null}

      {movie ? (
        <section className="card">
          <h3>Something to talk about</h3>
          <h2>{movie.name}</h2>
          <p className="desc">{story.movie}</p>
          <div className="chips">
            {movie.scores.map((s) => (
              <span key={s.member} className="chip plain">
                {s.member} {pct(s.affinity)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card">
        <details className="trace">
          <summary>
            Agent trace: {result.trace.length} Qloo calls ({result.modes.qloo === "mock" ? "mock" : "live"}), plan parsed by {result.plan.source === "llm" ? result.plan.model ?? result.modes.llmModel : "rules"}, text by {story.source === "llm" ? story.model ?? result.modes.llmModel : "template"}
          </summary>
          <div className="trace-scroll">
            <table className="trace-table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Request</th>
                  <th>Status</th>
                  <th>Results</th>
                </tr>
              </thead>
              <tbody>
                {result.trace.map((t, i) => (
                  <tr key={i}>
                    <td>{t.step}</td>
                    <td>
                      <code>
                        GET {t.path}?
                        {Object.entries(t.params)
                          .filter(([, v]) => v !== undefined)
                          .map(([k, v]) => `${k}=${String(v).length > 60 ? `${String(v).slice(0, 57)}...` : v}`)
                          .join("&")}
                      </code>
                    </td>
                    <td className={t.status < 300 ? "ok" : "bad"}>{t.status}</td>
                    <td>{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </>
  );
}
