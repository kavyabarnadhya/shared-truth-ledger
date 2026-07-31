import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveModelClient, LiveModelCallError } from "./live-client.ts";
import { FallbackModelClient } from "./fallback-client.ts";
import { ReplayModelClient, InMemoryRecordingStore } from "../core/model/client.ts";
import { computeCacheKey, promptSha } from "../core/model/cache-key.ts";
import { FREE_CONFIG } from "../core/model/config.ts";
import type { ModelRequest, RecordedCall } from "../core/types.ts";

function baseRequest(): ModelRequest {
  return {
    tier: "extraction",
    model: FREE_CONFIG.models.extraction,
    system: "sys",
    user: "usr",
    temperature: 0,
    maxOutputTokens: 800,
    inputKey: { x: 1 },
    step: "extract M-001",
  };
}

/** Swaps global fetch for the duration of a test, restoring it afterward even on throw. */
async function withMockedFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("LiveModelClient parses a successful gateway response into a ModelResponse", async () => {
  await withMockedFetch(
    (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"claims":[]}' }, finish_reason: "stop" }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
        { status: 200 },
      )) as unknown as typeof fetch,
    async () => {
      const client = new LiveModelClient(FREE_CONFIG, "test-key");
      const { response, trace } = await client.call(baseRequest());
      assert.equal(response.text, '{"claims":[]}');
      assert.equal(response.usage.inputTokens, 12);
      assert.equal(response.usage.outputTokens, 4);
      assert.equal(trace.mode, "live");
      assert.equal(trace.ok, true);
    },
  );
});

test("LiveModelClient throws LiveModelCallError with the status code on a non-2xx response", async () => {
  await withMockedFetch(
    (async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch,
    async () => {
      const client = new LiveModelClient(FREE_CONFIG, "test-key");
      await assert.rejects(
        () => client.call(baseRequest()),
        (err: unknown) => err instanceof LiveModelCallError && err.status === 429,
      );
    },
  );
});

test("FallbackModelClient falls back to replay on a 429 and marks the trace", async () => {
  const req = baseRequest();
  const key = computeCacheKey({
    v: 1, tier: req.tier, model: req.model, temperature: req.temperature,
    maxOutputTokens: req.maxOutputTokens, promptVersion: 1, judgeScope: null,
    system: req.system, inputKey: req.inputKey,
  });
  const recording: RecordedCall = {
    key, tier: req.tier, model: req.model, configId: FREE_CONFIG.id, judgeScope: null,
    step: req.step, promptSha: promptSha(req.system, req.user),
    request: { system: req.system, user: req.user, temperature: req.temperature, maxOutputTokens: req.maxOutputTokens },
    response: { text: '{"claims":[]}', usage: { inputTokens: 1, outputTokens: 1 }, finishReason: "stop" },
    latencyMs: 5, recordedAt: "2026-07-24T23:59:59+05:30" as import("../core/time.ts").Instant,
  };
  const store = new InMemoryRecordingStore([recording]);
  const replay = new ReplayModelClient(FREE_CONFIG, store, 1);

  await withMockedFetch(
    (async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch,
    async () => {
      const live = new LiveModelClient(FREE_CONFIG, "test-key");
      const fallback = new FallbackModelClient(live, replay);
      const { response, trace } = await fallback.call(req);
      assert.equal(response.text, '{"claims":[]}');
      assert.equal(trace.mode, "replay");
      assert.equal(trace.detail?.fallbackFrom, "live");
    },
  );
});

test("FallbackModelClient does NOT fall back on a non-rate-limit error (e.g. 400 bad request)", async () => {
  const req = baseRequest();
  const store = new InMemoryRecordingStore([]);
  const replay = new ReplayModelClient(FREE_CONFIG, store, 1);

  await withMockedFetch(
    (async () => new Response("bad request", { status: 400 })) as unknown as typeof fetch,
    async () => {
      const live = new LiveModelClient(FREE_CONFIG, "test-key");
      const fallback = new FallbackModelClient(live, replay);
      await assert.rejects(
        () => fallback.call(req),
        (err: unknown) => err instanceof LiveModelCallError && err.status === 400,
      );
    },
  );
});

test("FallbackModelClient rethrows the ORIGINAL live error when the fallback replay also misses", async () => {
  const req = baseRequest();
  const store = new InMemoryRecordingStore([]); // no recording at all
  const replay = new ReplayModelClient(FREE_CONFIG, store, 1);

  await withMockedFetch(
    (async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch,
    async () => {
      const live = new LiveModelClient(FREE_CONFIG, "test-key");
      const fallback = new FallbackModelClient(live, replay);
      await assert.rejects(
        () => fallback.call(req),
        (err: unknown) => err instanceof LiveModelCallError && err.status === 429,
      );
    },
  );
});
