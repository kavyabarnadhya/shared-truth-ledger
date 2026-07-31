/**
 * Comparator helpers used everywhere ordering must be deterministic across
 * runs and across engines (Node CLI vs browser). `Array.prototype.sort` is
 * stable in modern engines, but relying on insertion order as a tiebreak is
 * fragile and undocumented at call sites — every comparator here takes an
 * explicit final tiebreak key so two sorts of the same data always agree.
 */

export type Comparator<T> = (a: T, b: T) => number;

export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function compareNumbers(a: number, b: number): number {
  return a - b;
}

/** Combine comparators left to right; the first non-zero result wins. */
export function chain<T>(...comparators: Array<Comparator<T>>): Comparator<T> {
  return (a, b) => {
    for (const cmp of comparators) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}

export function byKey<T>(keyFn: (item: T) => string): Comparator<T> {
  return (a, b) => compareStrings(keyFn(a), keyFn(b));
}

export function byNumericKey<T>(keyFn: (item: T) => number): Comparator<T> {
  return (a, b) => compareNumbers(keyFn(a), keyFn(b));
}

/** Sort a copy; never mutates the input array. */
export function sortedBy<T>(items: readonly T[], comparator: Comparator<T>): T[] {
  return [...items].sort(comparator);
}

/**
 * Deterministic JSON stringify: object keys sorted recursively. Arrays keep
 * their given order — callers must pre-sort arrays whose order is not itself
 * meaningful data.
 *
 * `undefined` object values are omitted from the output, matching
 * `JSON.stringify` (so `{a: undefined}` and `{}` hash identically — this is
 * intentional: a caller building an object with `field: maybeCondition ?
 * value : undefined` gets the same key set either way, which is what "the
 * key wasn't set" should mean). `undefined` is rejected only where JSON has
 * no representation for it at all: as the top-level value, or as an array
 * element — those cases would otherwise throw non-deterministic ambiguity
 * (JSON.stringify turns array-undefined into `null`, silently changing the
 * value's identity), so they fail loudly instead.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) {
    throw new TypeError("stableStringify: top-level undefined has no JSON representation");
  }
  return stringifyValue(value, new Set());
}

function stringifyValue(value: unknown, seen: Set<unknown>): string {
  if (value === undefined) {
    throw new TypeError(
      "stableStringify: undefined is not serialisable inside an array (JSON.stringify would silently turn it into null)",
    );
  }
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new TypeError("stableStringify: non-finite number");
    }
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => stringifyValue(v, seen)).join(",") + "]";
  }
  if (t === "object") {
    if (seen.has(value)) {
      throw new TypeError("stableStringify: circular reference");
    }
    seen.add(value);
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const body = keys
      .map((k) => JSON.stringify(k) + ":" + stringifyValue(obj[k], seen))
      .join(",");
    seen.delete(value);
    return "{" + body + "}";
  }
  throw new TypeError(`stableStringify: unsupported type ${t}`);
}

/** Round to 4 decimals at the report boundary so float formatting can't diverge between runs. */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
