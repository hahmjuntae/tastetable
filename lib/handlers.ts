import { runAgent, sanitizeInput } from "./agent.ts";
import { llmMode, llmModel } from "./llm.ts";
import { qlooMode } from "./qloo/client.ts";
import { MOCK_EXAMPLE_FAVORITES } from "./qloo/mock.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function handlePlan(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ ok: false, error: "Request body must be JSON." }, 400);
  }
  const input = sanitizeInput(raw);
  if (typeof input === "string") return json({ ok: false, error: input }, 400);
  const result = await runAgent(input);
  return json(result, result.ok ? 200 : 502);
}

export function handleHealth(): Response {
  const qloo = qlooMode();
  return json({
    ok: true,
    qloo,
    llm: llmMode(),
    llmModel: llmModel(),
    ...(qloo === "mock" ? { mockFavorites: MOCK_EXAMPLE_FAVORITES } : {}),
  });
}
