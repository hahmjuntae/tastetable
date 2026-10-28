export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type LLMConfig = { baseUrl: string; apiKey: string; model: string; fallbacks: string[] };

export type LLMResult<T> = { ok: true; model: string; data: T } | { ok: false; reason: string };

// Gemini 무료 키의 OpenAI 호환 엔드포인트 기준
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
// 무료 등급 일일 한도는 모델별, 429 일 때만 다음 모델로 넘김
const DEFAULT_FALLBACKS = "gemini-3.5-flash-lite";
const TIMEOUT_MS = 12_000;

function config(): LLMConfig | null {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/?$/, "/");
  const fallbacks = (process.env.LLM_FALLBACK_MODELS ?? DEFAULT_FALLBACKS).split(",").map((m) => m.trim()).filter(Boolean);
  return { baseUrl, apiKey, model: process.env.LLM_MODEL?.trim() || DEFAULT_MODEL, fallbacks };
}

export function llmMode(): "live" | "mock" {
  return config() ? "live" : "mock";
}

export function llmModel(): string | null {
  return config()?.model ?? null;
}

// 공급자마다 response_format 지원이 달라 본문에서 JSON 객체만 추출하는 방식 우선
export function extractJSON(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const source = fenced ? fenced[1] : text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function chatJSON<T>(messages: ChatMessage[], validate: (v: unknown) => T | null): Promise<LLMResult<T>> {
  const c = config();
  if (!c) return { ok: false, reason: "no LLM key" };
  let last: LLMResult<T> = { ok: false, reason: "no model" };
  for (const model of [c.model, ...c.fallbacks.filter((m) => m !== c.model)]) {
    last = await callModel(c, model, messages, validate);
    if (last.ok || last.reason !== "HTTP 429") return last;
  }
  return last;
}

async function callModel<T>(c: LLMConfig, model: string, messages: ChatMessage[], validate: (v: unknown) => T | null): Promise<LLMResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${c.baseUrl}chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.3, response_format: { type: "json_object" } }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { ok: false, reason: "empty response" };
    const parsed = validate(extractJSON(content));
    if (parsed === null) return { ok: false, reason: "JSON shape mismatch" };
    return { ok: true, model, data: parsed };
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}
