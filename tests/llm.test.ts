import assert from "node:assert/strict";
import test from "node:test";
import { chatJSON } from "../lib/llm.ts";

test("chatJSON moves to the fallback model on HTTP 429", async () => {
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

async function withModels(primary: (model: string) => Response | Promise<Response>, run: (seen: string[]) => Promise<void>) {
  const realFetch = globalThis.fetch;
  const seen: string[] = [];
  process.env.LLM_API_KEY = "test";
  process.env.LLM_MODEL = "primary";
  process.env.LLM_FALLBACK_MODELS = "backup";
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const model = JSON.parse(init?.body ?? "{}").model as string;
    seen.push(model);
    return primary(model);
  }) as typeof fetch;
  try {
    await run(seen);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_FALLBACK_MODELS;
  }
}

const okBody = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

test("chatJSON also falls back on a 503 and on a JSON shape the validator rejects", async () => {
  for (const bad of [() => new Response("{}", { status: 503 }), () => okBody("not json")]) {
    await withModels((m) => (m === "primary" ? bad() : okBody('{"ok":true}')), async (seen) => {
      const res = await chatJSON([{ role: "user", content: "hi" }], (v) => (v ? (v as { ok: boolean }) : null));
      assert.deepEqual(seen, ["primary", "backup"]);
      assert.equal(res.ok && res.model, "backup");
    });
  }
});

test("chatJSON stops on a bad key and reports every model it tried", async () => {
  await withModels(() => new Response("{}", { status: 401 }), async (seen) => {
    const res = await chatJSON([{ role: "user", content: "hi" }], (v) => v);
    assert.deepEqual(seen, ["primary"]);
    assert.equal(!res.ok && res.reason, "primary: HTTP 401");
  });
  await withModels(() => new Response("{}", { status: 503 }), async (seen) => {
    const res = await chatJSON([{ role: "user", content: "hi" }], (v) => v);
    assert.deepEqual(seen, ["primary", "backup"]);
    assert.equal(!res.ok && res.reason, "primary: HTTP 503; backup: HTTP 503");
  });
});
