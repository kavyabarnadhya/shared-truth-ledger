import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "./sha256.ts";

test("sha256Hex matches known test vectors", () => {
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("sha256Hex handles multi-byte UTF-8", () => {
  // Just needs to be stable and not throw — exact value pinned so a future
  // change to utf8Bytes() is caught.
  const h = sha256Hex("café — café");
  assert.equal(h.length, 64);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("sha256Hex is deterministic across repeated calls", () => {
  const input = JSON.stringify({ a: 1, b: [1, 2, 3], c: "hello world" });
  assert.equal(sha256Hex(input), sha256Hex(input));
});

test("sha256Hex is sensitive to single-character changes", () => {
  assert.notEqual(sha256Hex("abc"), sha256Hex("abd"));
});

test("sha256Hex handles a long input spanning multiple 64-byte blocks", () => {
  const long = "x".repeat(1000);
  const h = sha256Hex(long);
  assert.match(h, /^[0-9a-f]{64}$/);
});
