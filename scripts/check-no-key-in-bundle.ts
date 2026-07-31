/**
 * Security guardrail: greps every built client-facing chunk under
 * .next/static for the AI Gateway key. The key is read only inside
 * src/server/**, never imported by src/lib/** or src/components/** (see
 * eslint.config.mjs's rule for that), but this script is the belt-and-
 * braces check on the actual build OUTPUT — the thing a reviewer's browser
 * would receive — not just the source graph.
 *
 * Run after `npm run build`. Exits non-zero if the key (or any
 * NEXT_PUBLIC_-prefixed leak of it) is found anywhere under .next/static.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const STATIC_DIR = join(ROOT, ".next", "static");

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (/\.(js|css|json)$/.test(entry)) files.push(full);
  }
}

function main(): void {
  if (!existsSync(STATIC_DIR)) {
    console.error(`${STATIC_DIR} does not exist — run \`npm run build\` first.`);
    process.exit(1);
  }

  const key = process.env.AI_GATEWAY_API_KEY;
  const files: string[] = [];
  walk(STATIC_DIR, files);

  const offenders: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (key && text.includes(key)) {
      offenders.push(`${file}: contains the literal AI_GATEWAY_API_KEY value`);
    }
    // Also catch the common vck_ prefix pattern even if the exact key isn't
    // set in this environment (e.g. CI without the real secret) — this
    // still catches an accidentally-hardcoded key of the same shape.
    if (/\bvck_[A-Za-z0-9]{20,}/.test(text)) {
      offenders.push(`${file}: contains a string matching the gateway key prefix pattern (vck_...)`);
    }
  }

  if (offenders.length > 0) {
    console.error(`FAIL: found ${offenders.length} client-bundle file(s) with a possible key leak:\n${offenders.join("\n")}`);
    process.exit(1);
  }

  console.log(`OK: scanned ${files.length} client-bundle files under .next/static, no gateway key found.`);
}

main();
