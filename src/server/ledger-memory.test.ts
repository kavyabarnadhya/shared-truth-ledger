import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryLedgerStore } from "./ledger-memory.ts";
import type { LedgerSnapshot, Instant } from "../core/types.ts";

function makeSnapshot(): LedgerSnapshot {
  const at = "2026-07-24T23:59:59+05:30" as Instant;
  return {
    asOf: at, configId: "free", judgeScope: "binary", corpusHash: "abc",
    buckets: [], verdicts: [], claims: [], rejectedClaims: [], gatedMessageIds: [], trace: [],
    suppressions: [], watermark: { lastMessageId: null, lastTimestamp: null, processedMessageIds: [], advancedAt: at },
    createdAt: at,
  };
}

test("MemoryLedgerStore.read() returns null before any write", async () => {
  const store = new MemoryLedgerStore();
  await store.clear(); // in case a previous test in this process left state
  assert.equal(await store.read(), null);
});

test("MemoryLedgerStore round-trips write then read", async () => {
  const store = new MemoryLedgerStore();
  const snapshot = makeSnapshot();
  await store.write(snapshot);
  assert.deepEqual(await store.read(), snapshot);
});

test("MemoryLedgerStore.clear() resets to null", async () => {
  const store = new MemoryLedgerStore();
  await store.write(makeSnapshot());
  await store.clear();
  assert.equal(await store.read(), null);
});

test("MemoryLedgerStore.describe() reports kind=memory and durable=false", () => {
  const store = new MemoryLedgerStore();
  const info = store.describe();
  assert.equal(info.kind, "memory");
  assert.equal(info.durable, false);
});

test("MemoryLedgerStore instances share module-level state (matches a warm serverless instance)", async () => {
  const a = new MemoryLedgerStore();
  const b = new MemoryLedgerStore();
  const snapshot = makeSnapshot();
  await a.write(snapshot);
  assert.deepEqual(await b.read(), snapshot);
  await b.clear(); // cleanup so later tests in this file/process aren't affected
});
