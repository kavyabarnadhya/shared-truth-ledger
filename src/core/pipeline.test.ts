import { test } from "node:test";
import assert from "node:assert/strict";
import { runAdjudicationPipeline } from "./pipeline.ts";
import { StubModelClient } from "./model/client.ts";
import { FREE_CONFIG } from "./model/config.ts";
import { parseInstant } from "./time.ts";
import { ESCALATION_CONFIDENCE_THRESHOLD, shouldEscalate } from "./router.ts";
import type { Claim, CastEntry, Message } from "./types.ts";

/**
 * Router unit tests: proves the confidence-gated escalation in
 * runAdjudicationPipeline actually gates on the primary call's
 * self-reported confidence, using StubModelClient (deterministic canned
 * responses keyed by trace step, no network / no recordings needed). See
 * router.ts for ESCALATION_CONFIDENCE_THRESHOLD and pipeline.ts for the
 * call site.
 */

const cast: CastEntry[] = [
  { handle: "meera.iyer", name: "Meera Iyer", role: "Product Manager", is_bot: false, authority_rank: 1 },
  { handle: "priya.raghunathan", name: "Priya Raghunathan", role: "Producer", is_bot: false, authority_rank: 1 },
];

const NO_CONTESTED = new Set<string>();

function message(id: string, text: string, timestamp: string, author: string): Message {
  return {
    id,
    source: "slack",
    thread_id: `T-${id}`,
    channel: "#liveops",
    author,
    author_name: author,
    author_role: "Product Manager",
    timestamp: parseInstant(timestamp),
    text,
    participants: [author],
    is_load_bearing: true,
  };
}

function claim(overrides: Partial<Claim> & Pick<Claim, "claim_id" | "message_id" | "referent" | "value" | "asserter" | "timestamp" | "source_span">): Claim {
  return {
    predicate: "value",
    raw_value: overrides.value,
    raw_referent: overrides.referent,
    modality: "assertion",
    polarity: "positive",
    attributed_to: null,
    span_valid: true,
    span_offset: 0,
    ...overrides,
  };
}

// Two live claims from different asserters about the same referent, with no
// pre-rule able to decide it (different people, no supersession/authority
// gap) -- this is exactly the shape that reaches the model in
// runAdjudicationPipeline.
const M1 = message("M-901", "we launch 12 August", "2026-07-06T10:00:00+05:30", "meera.iyer");
const M2 = message("M-902", "launch is the 15th", "2026-07-06T11:00:00+05:30", "priya.raghunathan");
// resolveReferent canonicalises "." to "_" in the referent key, so the
// bucket this actually lands in is "test_referent", not "test.referent" --
// the step strings below must match the real canonical key or the stub
// client's step lookup misses and every case degrades to the "fallback"
// COMPATIBLE path, which would make these tests pass for the wrong reason.
const CLAIMS: Claim[] = [
  claim({ claim_id: "CL-901", message_id: "M-901", referent: "test_referent", value: "2026-08-12", asserter: "meera.iyer", timestamp: M1.timestamp, source_span: "we launch 12 August" }),
  claim({ claim_id: "CL-902", message_id: "M-902", referent: "test_referent", value: "2026-08-15", asserter: "priya.raghunathan", timestamp: M2.timestamp, source_span: "launch is the 15th" }),
];
const messagesById = new Map([[M1.id, M1], [M2.id, M2]]);
const asOf = parseInstant("2026-07-10T23:59:59+05:30");

test("low-confidence primary response triggers a second, escalated call whose verdict wins", async () => {
  const primaryStep = "adjudicate test_referent@2026-07-10T23:59:59+05:30";
  const escalatedStep = `${primaryStep} [escalated]`;
  const client = new StubModelClient(
    FREE_CONFIG,
    new Map([
      [primaryStep, JSON.stringify({ verdict: "COMPATIBLE", rationale: "unsure", conflicting_claim_ids: [], confidence: 0.3 })],
      [escalatedStep, JSON.stringify({ verdict: "CONTRADICTION", rationale: "on reflection these conflict", conflicting_claim_ids: ["CL-901", "CL-902"], confidence: 0.9 })],
    ]),
  );

  const result = await runAdjudicationPipeline(CLAIMS, messagesById, cast, NO_CONTESTED, asOf, "binary", client);

  const verdict = result.verdicts.find((v) => v.bucket_key === "test_referent");
  assert.ok(verdict, "expected a verdict for test_referent");
  // The escalated call's verdict must win over the primary's.
  assert.equal(verdict!.verdict, "CONTRADICTION");
  assert.equal(verdict!.confidence, 0.9);

  // Both the primary and the escalated call must be visible in trace[].
  const steps = result.trace.map((t) => t.step);
  assert.ok(steps.includes(primaryStep), "primary call missing from trace");
  assert.ok(steps.includes(escalatedStep), "escalated call missing from trace");
});

test("high-confidence primary response does NOT trigger a second call", async () => {
  const primaryStep = "adjudicate test_referent@2026-07-10T23:59:59+05:30";
  const escalatedStep = `${primaryStep} [escalated]`;
  const client = new StubModelClient(
    FREE_CONFIG,
    new Map([
      [primaryStep, JSON.stringify({ verdict: "CONTRADICTION", rationale: "clear conflict", conflicting_claim_ids: ["CL-901", "CL-902"], confidence: 0.95 })],
      // Deliberately no entry for escalatedStep -- StubModelClient would
      // fall back to its default "{}" response, which would fail to parse
      // as a valid verdict and be an easy way to accidentally "pass" this
      // test even if escalation fired. Checking trace directly instead.
    ]),
  );

  const result = await runAdjudicationPipeline(CLAIMS, messagesById, cast, NO_CONTESTED, asOf, "binary", client);

  const verdict = result.verdicts.find((v) => v.bucket_key === "test_referent");
  assert.ok(verdict);
  assert.equal(verdict!.verdict, "CONTRADICTION");
  assert.equal(verdict!.confidence, 0.95);

  const steps = result.trace.map((t) => t.step);
  assert.ok(steps.includes(primaryStep));
  assert.ok(!steps.includes(escalatedStep), "escalated call fired despite high primary confidence");
});

test("primary response with no confidence field at all does NOT trigger escalation (absent != low)", async () => {
  const primaryStep = "adjudicate test_referent@2026-07-10T23:59:59+05:30";
  const escalatedStep = `${primaryStep} [escalated]`;
  const client = new StubModelClient(
    FREE_CONFIG,
    new Map([
      [primaryStep, JSON.stringify({ verdict: "COMPATIBLE", rationale: "no conflict", conflicting_claim_ids: [] })],
    ]),
  );

  const result = await runAdjudicationPipeline(CLAIMS, messagesById, cast, NO_CONTESTED, asOf, "binary", client);
  const steps = result.trace.map((t) => t.step);
  assert.ok(!steps.includes(escalatedStep), "escalated call fired despite absent confidence field");
});

test("shouldEscalate: below threshold escalates, at/above threshold does not, undefined does not", () => {
  assert.equal(shouldEscalate(0.0), true);
  assert.equal(shouldEscalate(0.59), true);
  assert.equal(shouldEscalate(ESCALATION_CONFIDENCE_THRESHOLD - 0.01), true);
  assert.equal(shouldEscalate(ESCALATION_CONFIDENCE_THRESHOLD), false);
  assert.equal(shouldEscalate(0.6), false);
  assert.equal(shouldEscalate(1.0), false);
  assert.equal(shouldEscalate(undefined), false);
});

test("ESCALATION_CONFIDENCE_THRESHOLD is the fixed value named in the build plan (0.6)", () => {
  assert.equal(ESCALATION_CONFIDENCE_THRESHOLD, 0.6);
});
