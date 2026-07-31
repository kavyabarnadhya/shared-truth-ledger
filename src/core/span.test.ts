import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpan } from "./span.ts";

const M001_TEXT =
  "Kicking off planning for the Independence Day event. Working assumption is we go live 12 August, config frozen by the 5th so QA gets a clean week.";

test("exact substring match succeeds at the correct offset", () => {
  const r = validateSpan(M001_TEXT, "we go live 12 August");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.offset, M001_TEXT.indexOf("we go live 12 August"));
    assert.equal(M001_TEXT.slice(r.offset, r.offset + "we go live 12 August".length), "we go live 12 August");
  }
});

test("REJECTS a hallucinated claim: '20 August' does not appear in M-001's text", () => {
  // This is the adversarial case the build plan calls out by name: a claim
  // asserting "we go live 20 August" must fail the span check, because the
  // real message says 12 August. If this ever passes, span validation is
  // broken and hallucinated claims would silently reach the ledger.
  const r = validateSpan(M001_TEXT, "we go live 20 August");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "not_found");
});

test("rejects a span that does not appear at all", () => {
  const r = validateSpan(M001_TEXT, "the sky is falling");
  assert.equal(r.ok, false);
});

test("rejects an empty span", () => {
  const r = validateSpan(M001_TEXT, "");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "empty_span");
});

test("rejects a whitespace-only span", () => {
  const r = validateSpan(M001_TEXT, "   ");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "empty_span");
});

test("rejects case-changed paraphrase (case differences are NOT tolerated)", () => {
  const r = validateSpan(M001_TEXT, "WE GO LIVE 12 AUGUST");
  assert.equal(r.ok, false);
});

test("rejects a span with a word dropped (paraphrase is NOT tolerated)", () => {
  const r = validateSpan(M001_TEXT, "we go live August");
  assert.equal(r.ok, false);
});

test("rejects a span with an extra word inserted", () => {
  const r = validateSpan(M001_TEXT, "we will go live 12 August");
  assert.equal(r.ok, false);
});

test("rejects ellipsis truncation as a substitute for the real middle text", () => {
  const r = validateSpan(M001_TEXT, "Kicking off planning ... config frozen");
  assert.equal(r.ok, false);
});

test("rejects a stemmed/inflected variant", () => {
  const text = "Rohan is planning the seeding logic for review.";
  const r = validateSpan(text, "plans the seeding logic");
  assert.equal(r.ok, false);
});

test("tolerates a whitespace difference (tab/newline vs single space)", () => {
  const text = "Line one.\nLine two continues here.";
  const r = validateSpan(text, "Line one. Line two continues here.");
  assert.equal(r.ok, true);
});

test("tolerates curly quotes vs straight quotes", () => {
  const text = "Rohan said “ship it Friday” in standup.";
  const r = validateSpan(text, 'said "ship it Friday" in standup');
  assert.equal(r.ok, true);
});

test("tolerates an em dash vs a hyphen", () => {
  const text = "Difficulty curve for levels 38–42 is rebalanced.";
  const r = validateSpan(text, "levels 38-42 is rebalanced");
  assert.equal(r.ok, true);
});

test("tolerates a non-breaking space vs a regular space", () => {
  const text = "Build 1.9.4 is not release-ready.";
  const r = validateSpan(text, "Build 1.9.4 is not release-ready");
  assert.equal(r.ok, true);
});

test("does not tolerate a genuinely different word even with whitespace noise", () => {
  const text = "D7 is down, not up.\nMy cut on paid installs has seven-day retention off 3pp.";
  const r = validateSpan(text, "D7 is up, not down.");
  assert.equal(r.ok, false);
});

test("real corpus check: every gold-style span for the flagship bucket validates", () => {
  const cases: Array<{ text: string; span: string }> = [
    {
      text: M001_TEXT,
      span: "we go live 12 August",
    },
    {
      text: "Sharing the release plan for the Independence Day event. Go-live is 15 August, aligned to the holiday itself. Sign-off gate is the 12th.",
      span: "Go-live is 15 August",
    },
    {
      text: "To be clear, we are not going with the 15th. Nothing has changed on my side.",
      span: "we are not going with the 15th",
    },
    {
      text: "Priya said it's the 15th now, so I've replanned the asset drops around that.",
      span: "Priya said it's the 15th now",
    },
    {
      text: "Let's go with the 15th. Aligning to the holiday itself is worth more than the extra three days of runway. Final.",
      span: "Let's go with the 15th",
    },
  ];
  for (const c of cases) {
    const r = validateSpan(c.text, c.span);
    assert.equal(r.ok, true, `expected span "${c.span}" to validate against "${c.text}"`);
  }
});
