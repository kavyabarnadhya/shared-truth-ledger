/**
 * All time in this codebase flows through here. Nothing in `src/core/**` (or
 * anywhere in the graded path) may call `Date.now()`, construct `new Date()`
 * with zero arguments, or call `toLocaleString()` — all three depend on the
 * host clock or host ICU data, which would make the CLI and the browser (or
 * two reviewers' machines) disagree. `Instant` is a branded string so a raw
 * `string` can't be passed where a validated, offset-carrying timestamp is
 * required without going through `parseInstant` first.
 *
 * A repo-wide grep test (time.test.ts) enforces the ban mechanically.
 */

/** ISO-8601 datetime with an explicit numeric UTC offset, e.g. "2026-07-24T23:59:59+05:30". */
export type Instant = string & { readonly __brand: "Instant" };

export interface Clock {
  /** The evaluation "now". Fixed per run, injected — never the wall clock. */
  now(): Instant;
}

const INSTANT_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?([+-])(\d{2}):(\d{2})$/;

/**
 * Validates and brands a timestamp string. Rejects anything without an
 * explicit offset (including a trailing "Z", which is a valid ISO offset but
 * not one this corpus ever uses — every source timestamp is IST). Throws
 * rather than silently coercing, because a silently-accepted malformed
 * timestamp is exactly the kind of bug that only shows up as a wrong verdict
 * three pipeline stages later.
 */
export function parseInstant(s: string): Instant {
  if (!INSTANT_RE.test(s)) {
    throw new TypeError(
      `parseInstant: "${s}" is not an ISO-8601 datetime with an explicit +HH:MM/-HH:MM offset`,
    );
  }
  return s as Instant;
}

/** Like parseInstant but returns null instead of throwing, for validation contexts. */
export function tryParseInstant(s: string): Instant | null {
  return INSTANT_RE.test(s) ? (s as Instant) : null;
}

function toParts(i: Instant): {
  y: number; mo: number; d: number; h: number; mi: number; s: number;
  offSign: 1 | -1; offH: number; offM: number;
} {
  const m = INSTANT_RE.exec(i);
  if (!m) throw new TypeError(`invalid Instant reached toParts: "${i}"`);
  return {
    y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]),
    h: Number(m[4]), mi: Number(m[5]), s: m[6] ? Number(m[6]) : 0,
    offSign: m[7] === "-" ? -1 : 1, offH: Number(m[8]), offM: Number(m[9]),
  };
}

/**
 * Epoch milliseconds. Safe to compute via Date.parse here specifically
 * because the offset is always explicit in a validated Instant — this is not
 * the banned "construct a date from a local-time string" pattern; it is
 * parsing a fully-qualified, unambiguous point in time.
 */
export function toEpochMs(i: Instant): number {
  return Date.parse(i);
}

export function compareInstants(a: Instant, b: Instant): number {
  const ea = toEpochMs(a);
  const eb = toEpochMs(b);
  return ea - eb;
}

export function isBefore(a: Instant, b: Instant): boolean {
  return compareInstants(a, b) < 0;
}

export function isSameOrBefore(a: Instant, b: Instant): boolean {
  return compareInstants(a, b) <= 0;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Renders an Instant in IST for display, by manual arithmetic on the
 * captured offset — never `toLocaleString`/`Intl`, whose output depends on
 * host locale data and would make a screenshot from one machine differ from
 * another's.
 */
export function formatIST(i: Instant): string {
  const p = toParts(i);
  const hh12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const ampm = p.h < 12 ? "AM" : "PM";
  const mi = String(p.mi).padStart(2, "0");
  return `${p.d} ${MONTHS[p.mo - 1]} ${p.y}, ${hh12}:${mi} ${ampm} IST`;
}

export const EVAL_AS_OF_DEFAULT = parseInstant("2026-07-24T23:59:59+05:30");
export const AS_OF_15_JUL = parseInstant("2026-07-15T23:59:59+05:30");
export const AS_OF_18_JUL = parseInstant("2026-07-18T23:59:59+05:30");

/** A Clock that always returns the same fixed Instant. The only Clock implementation that should exist. */
export function fixedClock(at: Instant): Clock {
  return { now: () => at };
}
