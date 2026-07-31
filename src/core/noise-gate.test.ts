import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateNoiseGate } from "./noise-gate.ts";
import type { CastEntry, Message } from "./types.ts";

const ROOT = join(import.meta.dirname, "..", "..");

function loadCorpus(): { messages: Message[]; cast: CastEntry[] } {
  const messages = JSON.parse(
    readFileSync(join(ROOT, "fixtures/corpus/messages.json"), "utf8"),
  ).messages as Message[];
  const cast = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/cast.json"), "utf8"))
    .cast as CastEntry[];
  return { messages, cast };
}

function msg(overrides: Partial<Message>): Message {
  return {
    id: "M-999",
    source: "slack",
    channel: "#liveops-ludojunction",
    thread_id: "T1",
    author: "meera.iyer",
    author_name: "Meera Iyer",
    author_role: "Product Manager",
    timestamp: "2026-07-06T10:12:00+05:30" as Message["timestamp"],
    text: "placeholder",
    participants: ["meera.iyer"],
    is_load_bearing: false,
    ...overrides,
  };
}

const { messages, cast } = loadCorpus();
const byId = new Map(messages.map((m) => [m.id, m]));

test("M-200 (ci-bot pipeline failure) is gated, redundantly by G1+G3+G4", () => {
  const r = evaluateNoiseGate(byId.get("M-200")!, cast);
  assert.equal(r.gated, true);
  assert.ok(r.rulesFired.includes("G1_bot_author"));
  assert.ok(r.rulesFired.includes("G3_gated_channel"));
  assert.ok(r.rulesFired.includes("G4_automation_signature"));
});

test("M-201 (Play Console review notification) is gated, redundantly by G1+G2+G4", () => {
  const r = evaluateNoiseGate(byId.get("M-201")!, cast);
  assert.equal(r.gated, true);
  assert.ok(r.rulesFired.includes("G1_bot_author"));
  assert.ok(r.rulesFired.includes("G2_automation_address"));
  assert.ok(r.rulesFired.includes("G4_automation_signature"));
});

test("M-202 (GameDev Weekly newsletter) is gated, redundantly by G1+G2+G4", () => {
  const r = evaluateNoiseGate(byId.get("M-202")!, cast);
  assert.equal(r.gated, true);
  assert.ok(r.rulesFired.includes("G1_bot_author"));
  assert.ok(r.rulesFired.includes("G2_automation_address"));
  assert.ok(r.rulesFired.includes("G4_automation_signature"));
});

test("M-203 (lunch emoji aside) is gated by G5 social-short", () => {
  const r = evaluateNoiseGate(byId.get("M-203")!, cast);
  assert.equal(r.gated, true);
  assert.deepEqual(r.rulesFired, ["G5_social_short"]);
});

// M-200..M-203 are load-bearing (verbatim from the spec, scored by the eval
// harness) AND expected to be gated — they are GOLD_LABELS' N11 noise
// scenario. "No load-bearing message is gated" really means "no load-bearing
// message that is supposed to reach the extractor is gated"; the four noise
// ids are the deliberate exception and are asserted gated above.
const EXPECTED_NOISE_IDS = new Set(["M-200", "M-201", "M-202", "M-203"]);

test("no load-bearing scenario message (other than the N11 noise set) is gated", () => {
  const loadBearing = messages.filter((m) => m.is_load_bearing && !EXPECTED_NOISE_IDS.has(m.id));
  const wronglyGated = loadBearing.filter((m) => evaluateNoiseGate(m, cast).gated);
  assert.deepEqual(
    wronglyGated.map((m) => m.id),
    [],
    `Load-bearing messages incorrectly gated: ${wronglyGated.map((m) => m.id).join(", ")}`,
  );
});

test("G3 fires for any message in #build-ci regardless of author", () => {
  const r = evaluateNoiseGate(
    msg({ channel: "#build-ci", author: "vikram.shetty", text: "checking on the pipeline status now" }),
    cast,
  );
  assert.ok(r.rulesFired.includes("G3_gated_channel"));
});

test("G2 fires for an automation-shaped address not in the cast table", () => {
  const r = evaluateNoiseGate(
    msg({ author: "notifications@example.com", text: "You have a new comment on your PR." }),
    cast,
  );
  assert.ok(r.rulesFired.includes("G2_automation_address"));
});

test("G5 does not gate a short message that mentions a cast handle", () => {
  const r = evaluateNoiseGate(msg({ text: "ping meera.iyer" }), cast);
  assert.ok(!r.rulesFired.includes("G5_social_short"));
});

test("G5 does not gate a short message containing a digit", () => {
  const r = evaluateNoiseGate(msg({ text: "back at 3" }), cast);
  assert.ok(!r.rulesFired.includes("G5_social_short"));
});

test("G5 does not gate a longer, substantive message", () => {
  const r = evaluateNoiseGate(
    msg({ text: "Calendar sign-off sits with me. That was the whole point of the change we made after Holi." }),
    cast,
  );
  assert.equal(r.gated, false);
});

test("a normal substantive slack message passes the gate (G6)", () => {
  const r = evaluateNoiseGate(byId.get("M-001")!, cast);
  assert.equal(r.gated, false);
  assert.deepEqual(r.rulesFired, []);
});
