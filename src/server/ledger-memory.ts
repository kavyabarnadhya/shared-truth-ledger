/**
 * In-memory LedgerStore for the Vercel deployment. Deliberately does NOT
 * survive a restart or a new serverless instance — this is the honest
 * tradeoff documented in the README: the hosted ledger is rebuilt per
 * session/request rather than requiring a reviewer to provision Upstash/KV
 * or any other external service just to load the page. Local dev uses
 * ledger-file.ts instead, which genuinely persists.
 *
 * A module-level singleton (not a class-level one) so every import of this
 * module in the same server process shares the same state — matching how a
 * single Vercel function instance behaves for the lifetime it's warm.
 */

import type { LedgerSnapshot, LedgerStore } from "../core/types.ts";

let snapshotInMemory: LedgerSnapshot | null = null;

export class MemoryLedgerStore implements LedgerStore {
  async read(): Promise<LedgerSnapshot | null> {
    return snapshotInMemory;
  }

  async write(snapshot: LedgerSnapshot): Promise<void> {
    snapshotInMemory = snapshot;
  }

  async clear(): Promise<void> {
    snapshotInMemory = null;
  }

  describe(): { kind: "memory"; durable: boolean; location: string } {
    return { kind: "memory", durable: false, location: "in-process memory (does not survive restart)" };
  }
}
