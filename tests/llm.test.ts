import assert from "node:assert/strict";
import test from "node:test";
import { chatJSON } from "../lib/llm.ts";

test("chatJSON moves to the fallback model only on HTTP 429", async () => {
  const realFetch = globalThis.fetch;
  const seen: string[] = [];
  process.env.LLM_API_KEY = "test";
  process.env.LLM_MODEL = "primary";
  process.env.LLM_FALLBACK_MODELS = "backup";
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const model = JSON.parse(init?.body ?? "{}").model as string;
    seen.push(model);
    if (model === "primary") return new Response("{}", { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const res = await chatJSON([{ role: "user", content: "hi" }], (v) => v as { ok: boolean });
    assert.deepEqual(seen, ["primary", "backup"]);
    assert.equal(res.ok && res.model, "backup");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_FALLBACK_MODELS;
  }
});
