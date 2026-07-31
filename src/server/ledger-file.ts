/**
 * File-backed LedgerStore for local development. Survives a restart — the
 * ledger state lives at ./ledger-data/ledger.json, which .gitignore excludes
 * (it's local runtime state, not a fixture). This is the implementation the
 * README's restart-survival claim is actually about; the deployed app uses
 * ledger-memory.ts instead, and does NOT survive a restart (also documented
 * in the README, not glossed over).
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LedgerSnapshot, LedgerStore } from "../core/types.ts";

const DEFAULT_PATH = join(process.cwd(), "ledger-data", "ledger.json");

export class FileLedgerStore implements LedgerStore {
  private readonly path: string;

  constructor(path: string = DEFAULT_PATH) {
    this.path = path;
  }

  async read(): Promise<LedgerSnapshot | null> {
    try {
      const text = await readFile(this.path, "utf8");
      return JSON.parse(text) as LedgerSnapshot;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async write(snapshot: LedgerSnapshot): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(snapshot, null, 2), "utf8");
  }

  async clear(): Promise<void> {
    try {
      await rm(this.path, { force: true });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  describe(): { kind: "file"; durable: boolean; location: string } {
    return { kind: "file", durable: true, location: this.path };
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "ENOENT";
}
