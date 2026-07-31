import { test } from "node:test";
import assert from "node:assert/strict";
import { ReplayModelClient, StubModelClient, InMemoryRecordingStore, ReplayMissError, PromptDriftError } from "./client.ts";
import { computeCacheKey, promptSha } from "./cache-key.ts";
import { FREE_CONFIG } from "./config.ts";
import { parseInstant } from "../time.ts";
import type { ModelRequest, RecordedCall } from "../types.ts";

function baseRequest(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    tier: "extraction",
    model: FREE_CONFIG.models.extraction,
    system: "You extract claims.",
    user: "Message: hello",
    temperature: 0,
    maxOutputTokens: 800,
    inputKey: { message_id: "M-001" },
    step: "extract M-001",
    ...overrides,
  };
}

function makeRecording(req: ModelRequest, responseText: string): RecordedCall {
  const key = computeCacheKey({
    v: 1,
    tier: req.tier,
    model: req.model,
    temperature: req.temperature,
    maxOutputTokens: req.maxOutputTokens,
    promptVersion: 1,
    judgeScope: req.judgeScope ?? null,
    system: req.system,
    inputKey: req.inputKey,
  });
  return {
    key,
    tier: req.tier,
    model: req.model,
    configId: FREE_CONFIG.id,
    judgeScope: req.judgeScope ?? null,
    step: req.step,
    promptSha: promptSha(req.system, req.user),
    request: { system: req.system, user: req.user, temperature: req.temperature, maxOutputTokens: req.maxOutputTokens },
    response: { text: responseText, usage: { inputTokens: 10, outputTokens: 5 }, finishReason: "stop" },
    latencyMs: 123,
    recordedAt: parseInstant("2026-07-20T09:00:00+05:30"),
  };
}

test("ReplayModelClient returns the recorded response on a cache hit", async () => {
  const req = baseRequest();
  const recording = makeRecording(req, '{"claims":[]}');
  const store = new InMemoryRecordingStore([recording]);
  const client = new ReplayModelClient(FREE_CONFIG, store, 1);

  const { response, trace } = await client.call(req);
  assert.equal(response.text, '{"claims":[]}');
  assert.equal(trace.cacheHit, true);
  assert.equal(trace.mode, "replay");
  assert.equal(trace.ok, true);
});

test("ReplayModelClient throws ReplayMissError, never silently falls back, on a cache miss", async () => {
  const store = new InMemoryRecordingStore([]);
  const client = new ReplayModelClient(FREE_CONFIG, store, 1);
  await assert.rejects(() => client.call(baseRequest()), ReplayMissError);
});

test("ReplayModelClient replays the recorded latencyMs verbatim rather than measuring", async () => {
  const req = baseRequest();
  const recording = makeRecording(req, "{}");
  const store = new InMemoryRecordingStore([recording]);
  const client = new ReplayModelClient(FREE_CONFIG, store, 1);
  const { trace } = await client.call(req);
  assert.equal(trace.latencyMs, 123);
});

test("ReplayModelClient throws PromptDriftError when the stored promptSha no longer matches", async () => {
  const req = baseRequest();
  const recording = makeRecording(req, "{}");
  // Corrupt the stored promptSha to simulate a prompt template change without re-recording.
  const corrupted: RecordedCall = { ...recording, promptSha: "0".repeat(64) };
  const store = new InMemoryRecordingStore([corrupted]);
  const client = new ReplayModelClient(FREE_CONFIG, store, 1);
  await assert.rejects(() => client.call(req), PromptDriftError);
});

test("ReplayModelClient reports costUsd as null for the free config", async () => {
  const req = baseRequest();
  const recording = makeRecording(req, "{}");
  const store = new InMemoryRecordingStore([recording]);
  const client = new ReplayModelClient(FREE_CONFIG, store, 1);
  const { trace } = await client.call(req);
  assert.equal(trace.costUsd, null);
});

test("ReplayModelClient assigns sequential, per-client trace ids scoped by step", async () => {
  const req1 = baseRequest({ step: "extract M-001" });
  const req2 = baseRequest({ step: "extract M-002", inputKey: { message_id: "M-002" } });
  const store = new InMemoryRecordingStore([makeRecording(req1, "{}"), makeRecording(req2, "{}")]);
  const client = new ReplayModelClient(FREE_CONFIG, store, 1);
  const r1 = await client.call(req1);
  const r2 = await client.call(req2);
  assert.equal(r1.trace.id, "extract M-001#1");
  assert.equal(r2.trace.id, "extract M-002#2");
});

test("two independent ReplayModelClient instances do not share trace sequence state", async () => {
  const req = baseRequest();
  const store = new InMemoryRecordingStore([makeRecording(req, "{}")]);
  const clientA = new ReplayModelClient(FREE_CONFIG, store, 1);
  const clientB = new ReplayModelClient(FREE_CONFIG, store, 1);
  const a = await clientA.call(req);
  const b = await clientB.call(req);
  assert.equal(a.trace.id, "extract M-001#1");
  assert.equal(b.trace.id, "extract M-001#1"); // fresh instance, fresh sequence
});

test("StubModelClient returns the canned response keyed by step", async () => {
  const client = new StubModelClient(FREE_CONFIG, new Map([["extract M-001", '{"claims":[{"foo":1}]}']]));
  const { response } = await client.call(baseRequest({ step: "extract M-001" }));
  assert.equal(response.text, '{"claims":[{"foo":1}]}');
});

test("StubModelClient falls back to the default response for an unmapped step", async () => {
  const client = new StubModelClient(FREE_CONFIG, new Map(), '{"default":true}');
  const { response } = await client.call(baseRequest({ step: "some other step" }));
  assert.equal(response.text, '{"default":true}');
});

test("InMemoryRecordingStore.keys() returns sorted keys", () => {
  const store = new InMemoryRecordingStore([
    makeRecording(baseRequest({ step: "b" }), "{}"),
    makeRecording(baseRequest({ step: "a", inputKey: { x: 2 } }), "{}"),
  ]);
  const keys = store.keys();
  assert.deepEqual(keys, [...keys].sort());
});
