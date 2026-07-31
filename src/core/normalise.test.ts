import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalisePhrase,
  jaccard,
  dice,
  similarity,
  normaliseDateValue,
  resolveHandleReference,
  parseNumberWithUnit,
  freeTextSimilarity,
} from "./normalise.ts";
import type { CastEntry } from "./types.ts";

test("normalisePhrase folds go-live variants onto the same key", () => {
  assert.equal(normalisePhrase("go live").normKey, normalisePhrase("go-live").normKey);
  assert.equal(normalisePhrase("golive date").normKey, normalisePhrase("launch date").normKey);
});

test("normalisePhrase drops stopwords", () => {
  const p = normalisePhrase("the launch date for the event");
  assert.ok(!p.tokens.has("the"));
  assert.ok(!p.tokens.has("for"));
});

test("normalisePhrase folds sign-off variants", () => {
  assert.equal(normalisePhrase("sign-off").normKey, normalisePhrase("signoff").normKey);
});

test("normalisePhrase folds d7/day 7/seven-day variants", () => {
  const a = normalisePhrase("d7 retention");
  const b = normalisePhrase("seven-day retention");
  assert.equal(a.normKey, b.normKey);
});

test("jaccard and dice both return 1 for identical sets and are order-independent", () => {
  const a = normalisePhrase("independence day event launch date");
  const b = normalisePhrase("launch date event independence day");
  assert.equal(jaccard(a.tokens, b.tokens), 1);
});

test("similarity is high for near-identical phrases and low for unrelated ones", () => {
  const a = normalisePhrase("independence day event go live date");
  const b = normalisePhrase("independence event launch date");
  const c = normalisePhrase("push notification service upgrade");
  assert.ok(similarity(a, b) > 0.5);
  assert.ok(similarity(a, c) < 0.2);
});

test("dice handles empty sets without dividing by zero", () => {
  assert.equal(dice(new Set(), new Set()), 1);
});

test("normaliseDateValue parses 'Month Day' with a 4-digit year", () => {
  assert.equal(normaliseDateValue("12 August", 2026), "2026-08-12");
  assert.equal(normaliseDateValue("August 12", 2026), "2026-08-12");
  assert.equal(normaliseDateValue("the 12th", 2026, 8), "2026-08-12");
});

test("normaliseDateValue passes through an already-ISO value", () => {
  assert.equal(normaliseDateValue("2026-08-12", 2026), "2026-08-12");
});

test("normaliseDateValue returns null for a bare ordinal with no context month", () => {
  assert.equal(normaliseDateValue("the 15th", 2026), null);
});

test("normaliseDateValue handles 'the 5th' style with context month", () => {
  assert.equal(normaliseDateValue("the 5th", 2026, 8), "2026-08-05");
});

const cast: CastEntry[] = [
  { handle: "meera.iyer", name: "Meera Iyer", role: "Product Manager", is_bot: false, authority_rank: 1 },
  { handle: "priya.raghunathan", name: "Priya Raghunathan", role: "Producer", is_bot: false, authority_rank: 1 },
  { handle: "karthik.nair", name: "Karthik Nair", role: "Studio Head", is_bot: false, authority_rank: 3 },
];

test("resolveHandleReference resolves 'me'/'I' to the message author", () => {
  assert.equal(resolveHandleReference("me", "meera.iyer", cast), "meera.iyer");
  assert.equal(resolveHandleReference("I", "priya.raghunathan", cast), "priya.raghunathan");
});

test("resolveHandleReference resolves a bare first name via the cast table", () => {
  assert.equal(resolveHandleReference("Priya", "meera.iyer", cast), "priya.raghunathan");
  assert.equal(resolveHandleReference("karthik", "meera.iyer", cast), "karthik.nair");
});

test("resolveHandleReference returns null for an unknown name", () => {
  assert.equal(resolveHandleReference("Someone Else", "meera.iyer", cast), null);
});

test("parseNumberWithUnit parses percentage-point and percent values", () => {
  assert.deepEqual(parseNumberWithUnit("1.8pp"), { n: 1.8, unit: "pp" });
  assert.deepEqual(parseNumberWithUnit("3pp"), { n: 3, unit: "pp" });
  assert.deepEqual(parseNumberWithUnit("12%"), { n: 12, unit: "%" });
});

test("parseNumberWithUnit returns null for non-numeric values", () => {
  assert.equal(parseNumberWithUnit("session depth"), null);
});

test("freeTextSimilarity scores near-duplicate phrasing highly", () => {
  const s = freeTextSimilarity(
    "session depth and returning players",
    "returning players and session depth",
  );
  assert.equal(s, 1);
});

test("freeTextSimilarity scores unrelated phrasing low", () => {
  const s = freeTextSimilarity("session depth and returning players", "ARPDAU lift across the seven-day window");
  assert.ok(s < 0.3);
});
