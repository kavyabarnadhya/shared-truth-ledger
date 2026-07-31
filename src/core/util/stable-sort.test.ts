import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareStrings,
  compareNumbers,
  chain,
  byKey,
  byNumericKey,
  sortedBy,
  stableStringify,
  round4,
} from "./stable-sort.ts";

test("compareStrings orders lexicographically", () => {
  assert.ok(compareStrings("a", "b") < 0);
  assert.ok(compareStrings("b", "a") > 0);
  assert.equal(compareStrings("a", "a"), 0);
});

test("chain falls through to the next comparator on a tie", () => {
  const items = [
    { primary: 1, id: "b" },
    { primary: 1, id: "a" },
    { primary: 0, id: "z" },
  ];
  const cmp = chain(
    byNumericKey((x: (typeof items)[number]) => x.primary),
    byKey((x: (typeof items)[number]) => x.id),
  );
  const sorted = sortedBy(items, cmp);
  assert.deepEqual(sorted.map((x) => x.id), ["z", "a", "b"]);
});

test("sortedBy never mutates the input", () => {
  const input = [3, 1, 2];
  const out = sortedBy(input, compareNumbers);
  assert.deepEqual(input, [3, 1, 2]);
  assert.deepEqual(out, [1, 2, 3]);
});

test("stableStringify sorts object keys regardless of insertion order", () => {
  const a = stableStringify({ b: 1, a: 2 });
  const b = stableStringify({ a: 2, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":2,"b":1}');
});

test("stableStringify sorts keys recursively", () => {
  const s = stableStringify({ z: { d: 1, c: 2 }, a: 1 });
  assert.equal(s, '{"a":1,"z":{"c":2,"d":1}}');
});

test("stableStringify preserves array order (arrays are meaningful data)", () => {
  const s = stableStringify({ a: [3, 1, 2] });
  assert.equal(s, '{"a":[3,1,2]}');
});

test("stableStringify omits undefined object values, same as JSON.stringify", () => {
  assert.equal(stableStringify({ a: 1, b: undefined }), '{"a":1}');
  assert.equal(stableStringify({ a: 1 }), '{"a":1}');
});

test("stableStringify rejects top-level undefined", () => {
  assert.throws(() => stableStringify(undefined));
});

test("stableStringify rejects undefined inside an array (ambiguous with null)", () => {
  assert.throws(() => stableStringify({ a: [1, undefined, 2] }));
});

test("round4 rounds to 4 decimal places", () => {
  assert.equal(round4(0.123456), 0.1235);
  assert.equal(round4(1), 1);
  assert.equal(round4(0.00001), 0);
});
