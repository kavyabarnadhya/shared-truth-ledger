/**
 * Picks the LedgerStore implementation from the LEDGER_STORE env var:
 * "file" (default locally) for a store that survives restart, "memory"
 * (default on Vercel, where a writable persistent filesystem doesn't exist)
 * for one that doesn't. See ledger-file.ts / ledger-memory.ts for what each
 * actually does and why.
 */

import type { LedgerStore } from "../core/types.ts";
import { FileLedgerStore } from "./ledger-file.ts";
import { MemoryLedgerStore } from "./ledger-memory.ts";

let cached: LedgerStore | null = null;

export function getLedgerStore(): LedgerStore {
  if (cached) return cached;
  const mode = (process.env.LEDGER_STORE ?? (process.env.VERCEL ? "memory" : "file")).toLowerCase();
  cached = mode === "memory" ? new MemoryLedgerStore() : new FileLedgerStore();
  return cached;
}
