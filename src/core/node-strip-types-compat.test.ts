import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every script in this repo (`npm test`, `npm run eval`, `scripts/*.ts`) runs
 * under `node --experimental-strip-types`, which is a STRIP-ONLY transform:
 * it deletes type syntax but does not compile away actual TypeScript
 * language features. TypeScript constructor parameter properties
 * (`constructor(private readonly x: T)`) are one such feature — they
 * implicitly generate a `this.x = x` assignment, which is code generation,
 * not erasure — so Node throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` the
 * moment it hits one. `tsc` and Next's bundler both accept the syntax fine,
 * so this class of bug is invisible to `npm run typecheck` and `npm run
 * build` and only surfaces at `node --experimental-strip-types` runtime —
 * exactly the reviewer's path (`npm run eval`, `npm test`). This test greps
 * for the pattern across the whole repo so it fails loudly and immediately
 * instead of silently at review time.
 *
 * (This was a real bug caught during development: src/core/model/client.ts
 * originally used parameter properties in four constructors.)
 */
test("no TypeScript constructor parameter properties anywhere in src/ or scripts/ (unsupported by node --experimental-strip-types)", () => {
  const offenders: string[] = [];
  // Matches "constructor(" followed, at some point before the matching ")",
  // by a parameter modified with public/private/protected/readonly. Scans
  // file contents as a whole (not line-by-line) so multi-line constructor
  // argument lists are caught.
  const paramPropertyRe = /constructor\s*\(([^)]*)\)/gs;
  const modifierRe = /\b(public|private|protected|readonly)\s+\w+\s*[:?]/;

  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === ".next" || entry.endsWith(".generated") || entry === "dist") continue;
        walk(full);
      } else if (/\.ts$/.test(entry) && !entry.endsWith(".generated.ts")) {
        // Test files run under node --experimental-strip-types too, so they
        // are scanned like everything else — only generated bundles (which
        // are plain data, not hand-written TS) are excluded.
        const text = stripComments(readFileSync(full, "utf8"));
        for (const m of text.matchAll(paramPropertyRe)) {
          if (modifierRe.test(m[1] ?? "")) {
            offenders.push(full);
            break;
          }
        }
      }
    }
  }

  walk(join(import.meta.dirname, ".."));
  const scriptsDir = join(import.meta.dirname, "..", "..", "scripts");
  try {
    walk(scriptsDir);
  } catch {
    // scripts/ may not exist yet this early in the build; fine to skip.
  }

  assert.deepEqual(
    offenders,
    [],
    `Found TypeScript constructor parameter properties (unsupported by node --experimental-strip-types):\n${offenders.join("\n")}`,
  );
});
