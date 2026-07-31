/**
 * `npm run check:core-purity` — standalone verification that src/core/**
 * imports no Node builtin. The ESLint rule in eslint.config.mjs enforces
 * this during `npm run lint`/`npm run build`; this script is a second,
 * independent check runnable on its own (e.g. in a pre-commit hook or CI
 * step that doesn't otherwise run the full lint pass), scanning the actual
 * import statements rather than relying on ESLint's resolver.
 *
 * This is the mechanical enforcement of the single rule the whole
 * CLI/browser parity claim depends on: if src/core/** ever imports node:fs,
 * node:crypto, process, etc., the Evals tab's in-browser run and the CLI's
 * run stop being guaranteed to agree, silently.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CORE_DIR = join(ROOT, "src", "core");

const BANNED_MODULES = [
  "fs", "node:fs", "fs/promises", "node:fs/promises",
  "path", "node:path",
  "crypto", "node:crypto",
  "process", "node:process",
  "os", "node:os",
  "child_process", "node:child_process",
  "net", "node:net",
  "http", "node:http", "https", "node:https",
];

const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry.endsWith(".generated")) continue;
      walk(full, files);
    } else if (/\.ts$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".generated.ts")) {
      // .test.ts is exempt: tests run under `node --test` directly, never
      // bundled for the browser, so node:fs/node:assert are legitimate
      // there — see eslint.config.mjs's matching carve-out and its comment.
      files.push(full);
    }
  }
}

function main(): void {
  const files: string[] = [];
  walk(CORE_DIR, files);

  const offenders: string[] = [];
  for (const file of files) {
    const text = stripComments(readFileSync(file, "utf8"));
    const specifiers = new Set<string>();
    for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) specifiers.add(m[1]!);
    }
    for (const spec of specifiers) {
      if (BANNED_MODULES.includes(spec) || spec.startsWith("node:")) {
        offenders.push(`${file}: imports "${spec}"`);
      }
    }
  }

  if (offenders.length > 0) {
    console.error(`FAIL: src/core/** must not import Node builtins (${offenders.length} violation(s)):\n${offenders.join("\n")}`);
    process.exit(1);
  }

  console.log(`OK: scanned ${files.length} files under src/core/**, no Node builtin imports found.`);
}

main();
