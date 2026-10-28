import { mockQloo } from "./mock.ts";
import type { QlooParams, TraceEntry } from "./types.ts";

// 해커톤 키는 이 호스트 전용, 개발자 가이드 근거
const DEFAULT_BASE_URL = "https://hackathon.api.qloo.com";
const TIMEOUT_MS = 10_000;

export type QlooMode = "live" | "mock";

export function qlooMode(): QlooMode {
  return process.env.QLOO_API_KEY?.trim() ? "live" : "mock";
}

export class QlooError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toQuery(params: QlooParams): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    qs.set(key, String(value));
  }
  return qs;
}

// 키 유무로 실제 호출과 fixture 를 가르는 유일한 분기 지점
export async function qlooGet<T>(step: string, path: string, params: QlooParams, trace: TraceEntry[]): Promise<T> {
  const started = Date.now();
  const mode = qlooMode();
  let status = 200;
  let body: unknown;
  try {
    if (mode === "mock") {
      const res = mockQloo(path, params);
      status = res.status;
      body = res.body;
    } else {
      const base = (process.env.QLOO_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${base}${path}?${toQuery(params)}`, {
          headers: { "X-Api-Key": process.env.QLOO_API_KEY!.trim(), accept: "application/json" },
          signal: controller.signal,
        });
        status = res.status;
        body = await res.json().catch(() => null);
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (error) {
    status = 599;
    body = { error: error instanceof Error ? error.message : "request failed" };
  }
  trace.push({ step, path, params, status, ms: Date.now() - started, count: countResults(body), mode });
  if (status < 200 || status >= 300) {
    const err = body as { message?: unknown; error?: unknown } | null;
    const detail = err?.message ?? err?.error;
    throw new QlooError(status, `${path} ${status}${detail ? `: ${String(detail)}` : ""}`);
  }
  return body as T;
}

function countResults(body: unknown): number {
  const results = (body as { results?: unknown } | null)?.results;
  if (Array.isArray(results)) return results.length;
  if (results && typeof results === "object") {
    const r = results as { entities?: unknown[]; tags?: unknown[] };
    return (r.entities?.length ?? 0) + (r.tags?.length ?? 0);
  }
  return 0;
}
