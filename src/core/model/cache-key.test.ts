import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCacheKey, promptSha } from "./cache-key.ts";

const base = {
  v: 1 as const,
  tier: "extraction" as const,
  model: "inclusionai/ling-3.0-flash-free",
  temperature: 0,
  maxOutputTokens: 800,
  promptVersion: 1,
  judgeScope: null,
  system: "You extract claims.",
};

test("computeCacheKey is deterministic for identical input", () => {
  const a = computeCacheKey({ ...base, inputKey: { message_id: "M-001", text: "hello" } });
  const b = computeCacheKey({ ...base, inputKey: { message_id: "M-001", text: "hello" } });
  assert.equal(a, b);
});

test("computeCacheKey is insensitive to inputKey object key order", () => {
  const a = computeCacheKey({ ...base, inputKey: { message_id: "M-001", text: "hello" } });
  const b = computeCacheKey({ ...base, inputKey: { text: "hello", message_id: "M-001" } });
  assert.equal(a, b);
});

test("computeCacheKey changes when the semantic input changes", () => {
  const a = computeCacheKey({ ...base, inputKey: { message_id: "M-001", text: "hello" } });
  const b = computeCacheKey({ ...base, inputKey: { message_id: "M-001", text: "goodbye" } });
  assert.notEqual(a, b);
});

test("computeCacheKey changes when promptVersion changes (invalidates recordings on prompt template change)", () => {
  const a = computeCacheKey({ ...base, promptVersion: 1, inputKey: { message_id: "M-001" } });
  const b = computeCacheKey({ ...base, promptVersion: 2, inputKey: { message_id: "M-001" } });
  assert.notEqual(a, b);
});

test("computeCacheKey changes when the model changes", () => {
  const a = computeCacheKey({ ...base, inputKey: { message_id: "M-001" } });
  const b = computeCacheKey({ ...base, model: "anthropic/claude-sonnet-5", inputKey: { message_id: "M-001" } });
  assert.notEqual(a, b);
});

test("computeCacheKey changes when judgeScope changes", () => {
  const a = computeCacheKey({ ...base, judgeScope: "binary", inputKey: { referent: "x" } });
  const b = computeCacheKey({ ...base, judgeScope: "full7", inputKey: { referent: "x" } });
  assert.notEqual(a, b);
});

test("computeCacheKey changes when the system prompt changes", () => {
  const a = computeCacheKey({ ...base, system: "prompt A", inputKey: { x: 1 } });
  const b = computeCacheKey({ ...base, system: "prompt B", inputKey: { x: 1 } });
  assert.notEqual(a, b);
});

test("computeCacheKey handles nested inputKey structures (adjudication's claim list shape)", () => {
  const inputA = {
    referent: "indep_event.launch_date",
    asOf: "2026-07-15T23:59:59+05:30",
    claims: [
      { claim_id: "CL-001", asserter: "meera.iyer", value: "2026-08-12" },
      { claim_id: "CL-002", asserter: "priya.raghunathan", value: "2026-08-15" },
    ],
  };
  const inputB = JSON.parse(JSON.stringify(inputA)); // structurally identical, different object identity
  const a = computeCacheKey({ ...base, tier: "adjudication", inputKey: inputA });
  const b = computeCacheKey({ ...base, tier: "adjudication", inputKey: inputB });
  assert.equal(a, b);
});

test("computeCacheKey produces a 32-character lowercase hex key", () => {
  const key = computeCacheKey({ ...base, inputKey: { x: 1 } });
  assert.equal(key.length, 32);
  assert.match(key, /^[0-9a-f]{32}$/);
});

test("promptSha is deterministic and sensitive to either input", () => {
  const a = promptSha("system A", "user A");
  const b = promptSha("system A", "user A");
  const c = promptSha("system A", "user B");
  assert.equal(a, b);
  assert.notEqual(a, c);
});
