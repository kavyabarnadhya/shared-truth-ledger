import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileLedgerStore } from "./ledger-file.ts";
import type { LedgerSnapshot } from "../core/types.ts";

function makeSnapshot(overrides: Partial<LedgerSnapshot> = {}): LedgerSnapshot {
  return {
    asOf: "2026-07-24T23:59:59+05:30" as import("../core/time.ts").Instant,
    configId: "free",
    judgeScope: "binary",
    corpusHash: "abc123",
    buckets: [],
    verdicts: [],
    claims: [],
    rejectedClaims: [],
    gatedMessageIds: [],
    trace: [],
    suppressions: [],
    watermark: { lastMessageId: null, lastTimestamp: null, processedMessageIds: [], advancedAt: "2026-07-24T23:59:59+05:30" as import("../core/time.ts").Instant },
    createdAt: "2026-07-24T23:59:59+05:30" as import("../core/time.ts").Instant,
    ...overrides,
  };
}

test("FileLedgerStore.read() returns null when no file exists yet", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-test-"));
  try {
    const store = new FileLedgerStore(join(dir, "ledger.json"));
    assert.equal(await store.read(), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileLedgerStore round-trips write then read", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-test-"));
  try {
    const store = new FileLedgerStore(join(dir, "ledger.json"));
    const snapshot = makeSnapshot({ configId: "free" });
    await store.write(snapshot);
    const read = await store.read();
    assert.deepEqual(read, snapshot);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileLedgerStore creates parent directories as needed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-test-"));
  try {
    const store = new FileLedgerStore(join(dir, "nested", "deeper", "ledger.json"));
    await store.write(makeSnapshot());
    const read = await store.read();
    assert.ok(read);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileLedgerStore.clear() removes the file, read() then returns null", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-test-"));
  try {
    const store = new FileLedgerStore(join(dir, "ledger.json"));
    await store.write(makeSnapshot());
    assert.ok(await store.read());
    await store.clear();
    assert.equal(await store.read(), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileLedgerStore.clear() on a nonexistent file does not throw", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-test-"));
  try {
    const store = new FileLedgerStore(join(dir, "ledger.json"));
    await store.clear();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("FileLedgerStore.describe() reports kind=file and durable=true", () => {
  const store = new FileLedgerStore(join(tmpdir(), "unused.json"));
  const info = store.describe();
  assert.equal(info.kind, "file");
  assert.equal(info.durable, true);
});
