import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  parseInstant,
  tryParseInstant,
  compareInstants,
  isBefore,
  isSameOrBefore,
  formatIST,
  toEpochMs,
  fixedClock,
  EVAL_AS_OF_DEFAULT,
  AS_OF_15_JUL,
  AS_OF_18_JUL,
} from "./time.ts";

test("parseInstant accepts a full IST timestamp", () => {
  const i = parseInstant("2026-07-06T10:12:00+05:30");
  assert.equal(i, "2026-07-06T10:12:00+05:30");
});

test("parseInstant accepts seconds-omitted form", () => {
  const i = parseInstant("2026-07-24T23:59+05:30");
  assert.ok(i);
});

test("parseInstant rejects a bare Z timestamp", () => {
  assert.throws(() => parseInstant("2026-07-06T10:12:00Z"));
});

test("parseInstant rejects a local-time string with no offset", () => {
  assert.throws(() => parseInstant("2026-07-06T10:12:00"));
});

test("parseInstant rejects garbage", () => {
  assert.throws(() => parseInstant("not a date"));
});

test("tryParseInstant returns null instead of throwing", () => {
  assert.equal(tryParseInstant("garbage"), null);
  assert.ok(tryParseInstant("2026-07-06T10:12:00+05:30"));
});

test("compareInstants orders chronologically across the +05:30 offset", () => {
  const a = parseInstant("2026-07-06T10:12:00+05:30");
  const b = parseInstant("2026-07-15T18:22:00+05:30");
  assert.ok(compareInstants(a, b) < 0);
  assert.ok(compareInstants(b, a) > 0);
  assert.equal(compareInstants(a, a), 0);
});

test("isBefore / isSameOrBefore", () => {
  const a = parseInstant("2026-07-06T10:12:00+05:30");
  const b = parseInstant("2026-07-15T18:22:00+05:30");
  assert.ok(isBefore(a, b));
  assert.ok(!isBefore(b, a));
  assert.ok(isSameOrBefore(a, a));
  assert.ok(!isBefore(a, a));
});

test("toEpochMs is monotonic with compareInstants", () => {
  const a = parseInstant("2026-07-06T10:12:00+05:30");
  const b = parseInstant("2026-07-15T18:22:00+05:30");
  assert.ok(toEpochMs(a) < toEpochMs(b));
});

test("formatIST renders without relying on host locale", () => {
  const i = parseInstant("2026-07-06T10:12:00+05:30");
  assert.equal(formatIST(i), "6 Jul 2026, 10:12 AM IST");
});

test("formatIST renders PM correctly", () => {
  const i = parseInstant("2026-07-15T18:22:00+05:30");
  assert.equal(formatIST(i), "15 Jul 2026, 6:22 PM IST");
});

test("fixedClock always returns the same instant", () => {
  const clock = fixedClock(EVAL_AS_OF_DEFAULT);
  assert.equal(clock.now(), EVAL_AS_OF_DEFAULT);
  assert.equal(clock.now(), clock.now());
});

test("the three named as-of constants are distinct and ordered", () => {
  assert.ok(isBefore(AS_OF_15_JUL, AS_OF_18_JUL));
  assert.ok(isBefore(AS_OF_18_JUL, EVAL_AS_OF_DEFAULT));
});

test("no Date.now(), no zero-arg new Date(), no toLocaleString anywhere under src/core/ (code, not comments)", () => {
  // Scoped to src/core/ deliberately, not the whole src/ tree: the ban is
  // about CLI/browser parity for the graded pipeline, which is exactly
  // src/core/**'s contract (see eslint.config.mjs's core-purity rule).
  // src/server/** legitimately measures real wall-clock latency for live
  // model calls (live-client.ts) and real request timing for rate limiting
  // — that is infrastructure telemetry, not graded logic, and it is
  // explicitly allowed to use the wall clock as long as it stays out of
  // src/core/. Scripts and the Next app layer are unconstrained too.
  const offenders: string[] = [];
  const bannedPatterns: Array<{ name: string; re: RegExp }> = [
    { name: "Date.now(", re: /Date\.now\s*\(/ },
    { name: "new Date()", re: /new Date\s*\(\s*\)/ },
    { name: "toLocaleString(", re: /toLocaleString\s*\(/ },
    { name: "toLocaleDateString(", re: /toLocaleDateString\s*\(/ },
  ];

  // Strip // line comments and /* */ block comments (including doc comments
  // that legitimately name the banned APIs, like this file's own docstrings)
  // before scanning, so the check looks at code, not prose about the rule.
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  const SELF = import.meta.filename;

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === ".next" || entry.endsWith(".generated")) continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".generated.ts") && full !== SELF) {
        const text = stripComments(readFileSync(full, "utf8"));
        for (const { name, re } of bannedPatterns) {
          if (re.test(text)) offenders.push(`${full}: contains ${name}`);
        }
      }
    }
  }

  walk(import.meta.dirname); // src/core/ itself — see scoping note above
  assert.deepEqual(offenders, [], `Found banned time APIs:\n${offenders.join("\n")}`);
});
