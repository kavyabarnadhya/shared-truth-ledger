import { test } from "node:test";
import assert from "node:assert/strict";
import {
  projectAsOf,
  buildAmbiguityBuckets,
  advanceWatermark,
  emptyWatermark,
  isSuppressed,
  dismissBucket,
} from "./ledger.ts";
import { parseInstant, AS_OF_15_JUL, AS_OF_18_JUL, EVAL_AS_OF_DEFAULT } from "./time.ts";
import type { Claim, CastEntry } from "./types.ts";

const cast: CastEntry[] = [
  { handle: "meera.iyer", name: "Meera Iyer", role: "Product Manager", is_bot: false, authority_rank: 1 },
  { handle: "priya.raghunathan", name: "Priya Raghunathan", role: "Producer", is_bot: false, authority_rank: 1 },
  { handle: "rohan.desai", name: "Rohan Desai", role: "Game Designer", is_bot: false, authority_rank: 1 },
  { handle: "sana.kulkarni", name: "Sana Kulkarni", role: "Art Lead", is_bot: false, authority_rank: 1 },
  { handle: "karthik.nair", name: "Karthik Nair", role: "Studio Head", is_bot: false, authority_rank: 3 },
];

const NO_CONTESTED = new Set<string>();

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

// ---------------------------------------------------------------------------
// THE FLAGSHIP BUCKET: indep_event.launch_date at two points in time.
// Gold claims only, per GOLD_LABELS.md §2-3 — this is the single hardest
// bucket in the corpus and the clearest evidence the ledger is stateful
// rather than a pairwise text diff.
// ---------------------------------------------------------------------------

const CL001 = claim({
  claim_id: "CL-001", message_id: "M-001", referent: "indep_event.launch_date",
  value: "2026-08-12", asserter: "meera.iyer",
  timestamp: parseInstant("2026-07-06T10:12:00+05:30"),
  source_span: "we go live 12 August",
});
const CL121 = claim({
  claim_id: "CL-121", message_id: "M-121", referent: "indep_event.launch_date",
  value: "2026-08-15", asserter: "priya.raghunathan",
  timestamp: parseInstant("2026-07-13T10:44:00+05:30"),
  source_span: "Launch is the 15th",
});
const CL002 = claim({
  claim_id: "CL-002", message_id: "M-002", referent: "indep_event.launch_date",
  value: "2026-08-15", asserter: "priya.raghunathan",
  timestamp: parseInstant("2026-07-15T18:22:00+05:30"),
  source_span: "Go-live is 15 August",
});
const CL170 = claim({
  claim_id: "CL-170", message_id: "M-170", referent: "indep_event.launch_date",
  value: "2026-08-15", asserter: "meera.iyer", polarity: "negative",
  timestamp: parseInstant("2026-07-16T18:30:00+05:30"),
  source_span: "we are not going with the 15th",
});
const CL160 = claim({
  claim_id: "CL-160", message_id: "M-160", referent: "indep_event.launch_date",
  value: "2026-08-15", asserter: "sana.kulkarni", modality: "reported",
  attributed_to: "priya.raghunathan",
  timestamp: parseInstant("2026-07-17T12:15:00+05:30"),
  source_span: "Priya said it's the 15th now",
});
const CL110 = claim({
  claim_id: "CL-110", message_id: "M-110", referent: "indep_event.launch_date",
  value: "2026-08-15", asserter: "karthik.nair",
  timestamp: parseInstant("2026-07-17T20:15:00+05:30"),
  source_span: "Let's go with the 15th",
});

const FLAGSHIP_CLAIMS: Claim[] = [CL001, CL121, CL002, CL170, CL160, CL110];

test("flagship @ 15 Jul: only CL-001, CL-121, CL-002 are visible; CL-121 superseded by CL-002; two live claims -> no pre-rule verdict (model decides CONTRADICTION)", () => {
  const { buckets } = projectAsOf(FLAGSHIP_CLAIMS, AS_OF_15_JUL, cast, NO_CONTESTED);
  const bucket = buckets.find((b) => b.referent === "indep_event.launch_date")!;
  assert.ok(bucket, "bucket must exist");

  const visibleIds = bucket.claims.map((bc) => bc.claim.claim_id);
  assert.deepEqual(visibleIds.sort(), ["CL-001", "CL-002", "CL-121"]);

  const cl121 = bucket.claims.find((bc) => bc.claim.claim_id === "CL-121")!;
  assert.equal(cl121.state, "superseded");
  assert.equal(cl121.supersededBy, "CL-002");

  const liveIds = bucket.liveClaims.map((c) => c.claim_id).sort();
  assert.deepEqual(liveIds, ["CL-001", "CL-002"]);

  // Two live claims, two distinct asserters, no pre-rule fires strongly
  // enough to decide the verdict outright -> this is exactly the case that
  // must reach the model, which is expected to say CONTRADICTION.
  assert.equal(bucket.preRuleVerdict, null);
});

test("flagship @ 18 Jul: all six visible; CL-160 excluded (reported); CL-170 consistent with CL-001 (not a new position); CL-110 supersedes by authority -> RESOLVED_BY_SUPERSESSION", () => {
  const { buckets } = projectAsOf(FLAGSHIP_CLAIMS, AS_OF_18_JUL, cast, NO_CONTESTED);
  const bucket = buckets.find((b) => b.referent === "indep_event.launch_date")!;

  const visibleIds = bucket.claims.map((bc) => bc.claim.claim_id).sort();
  assert.deepEqual(visibleIds, ["CL-001", "CL-002", "CL-110", "CL-121", "CL-160", "CL-170"]);

  const cl160 = bucket.claims.find((bc) => bc.claim.claim_id === "CL-160")!;
  assert.equal(cl160.state, "excluded_reported");

  const cl170 = bucket.claims.find((bc) => bc.claim.claim_id === "CL-170")!;
  assert.notEqual(cl170.state, "live", "CL-170 (negative polarity) must not register as a new live position");

  const cl001 = bucket.claims.find((bc) => bc.claim.claim_id === "CL-001")!;
  assert.equal(cl001.state, "superseded", "CL-001 is superseded by authority (CL-110), not left dangling");
  assert.equal(cl001.supersededBy, "CL-110");

  const liveIds = bucket.liveClaims.map((c) => c.claim_id);
  assert.deepEqual(liveIds, ["CL-110"], "only the authoritative claim remains live");

  assert.equal(bucket.preRuleVerdict, "RESOLVED_BY_SUPERSESSION");

  const r5 = bucket.preRuleTrace.find((t) => t.rule === "R5_authoritative_supersession");
  assert.ok(r5, "R5 must have fired");
  assert.equal(r5!.decidesVerdict, "RESOLVED_BY_SUPERSESSION");
});

test("flagship at the frozen EVAL_AS_OF (24 Jul) is the same as 18 Jul: RESOLVED_BY_SUPERSESSION", () => {
  const { buckets } = projectAsOf(FLAGSHIP_CLAIMS, EVAL_AS_OF_DEFAULT, cast, NO_CONTESTED);
  const bucket = buckets.find((b) => b.referent === "indep_event.launch_date")!;
  assert.equal(bucket.preRuleVerdict, "RESOLVED_BY_SUPERSESSION");
  assert.deepEqual(bucket.liveClaims.map((c) => c.claim_id), ["CL-110"]);
});

test("flagship: CL-170's negative claim, if this asserter had no live positive counterpart, would remain a live NOT-claim", () => {
  // Isolate CL-170 without CL-001 to exercise the "no positive counterpart"
  // branch of R3 directly.
  const claims = [CL121, CL002, CL170];
  const { buckets } = projectAsOf(claims, AS_OF_18_JUL, cast, NO_CONTESTED);
  const bucket = buckets.find((b) => b.referent === "indep_event.launch_date")!;
  const cl170 = bucket.claims.find((bc) => bc.claim.claim_id === "CL-170")!;
  assert.equal(cl170.state, "live");
});

// ---------------------------------------------------------------------------
// N1 — self-revision -> UPDATE
// ---------------------------------------------------------------------------

test("N1: level40_art.eta self-revision collapses to one live claim and is flagged as an UPDATE bucket", () => {
  const cl100 = claim({
    claim_id: "CL-100", message_id: "M-100", referent: "level40_art.eta",
    value: "2026-07-24", asserter: "sana.kulkarni",
    timestamp: parseInstant("2026-07-09T11:30:00+05:30"), source_span: "lands 24 July",
  });
  const cl101 = claim({
    claim_id: "CL-101", message_id: "M-101", referent: "level40_art.eta",
    value: "2026-07-29", asserter: "sana.kulkarni",
    timestamp: parseInstant("2026-07-13T15:05:00+05:30"), source_span: "will be 29 July",
  });
  const { buckets, updateBucketKeys } = projectAsOf([cl100, cl101], EVAL_AS_OF_DEFAULT, cast, NO_CONTESTED);
  const bucket = buckets.find((b) => b.referent === "level40_art.eta")!;
  assert.deepEqual(bucket.liveClaims.map((c) => c.claim_id), ["CL-101"]);
  assert.ok(updateBucketKeys.has("level40_art.eta"));
});

// ---------------------------------------------------------------------------
// N10 — raised then reconciled: CONTRADICTION at 11:20, RESOLVED_BY_CORRECTION at 15:40
// ---------------------------------------------------------------------------

test("N10: reward_config.tiers is a live contradiction at 11:20 and resolved by self-correction at 15:40", () => {
  const cl190 = claim({
    claim_id: "CL-190", message_id: "M-190", referent: "reward_config.tiers",
    value: "12", asserter: "rohan.desai",
    timestamp: parseInstant("2026-07-10T11:00:00+05:30"), source_span: "12 tiers",
  });
  const cl191 = claim({
    claim_id: "CL-191", message_id: "M-191", referent: "reward_config.tiers",
    value: "8", asserter: "meera.iyer",
    timestamp: parseInstant("2026-07-10T11:20:00+05:30"), source_span: "8 tiers built",
  });
  const cl192 = claim({
    claim_id: "CL-192", message_id: "M-192", referent: "reward_config.tiers",
    value: "8", asserter: "rohan.desai",
    timestamp: parseInstant("2026-07-10T15:40:00+05:30"), source_span: "8 tiers is correct",
  });
  const all = [cl190, cl191, cl192];

  const at1120 = parseInstant("2026-07-10T11:20:00+05:30");
  const { buckets: b1 } = projectAsOf(all, at1120, cast, NO_CONTESTED);
  const bucket1 = b1.find((b) => b.referent === "reward_config.tiers")!;
  assert.deepEqual(bucket1.liveClaims.map((c) => c.claim_id).sort(), ["CL-190", "CL-191"]);
  assert.equal(bucket1.preRuleVerdict, null); // two live, different asserters -> model would say CONTRADICTION

  const at1540 = parseInstant("2026-07-10T15:41:00+05:30");
  const { buckets: b2 } = projectAsOf(all, at1540, cast, NO_CONTESTED);
  const bucket2 = b2.find((b) => b.referent === "reward_config.tiers")!;
  assert.equal(bucket2.preRuleVerdict, "RESOLVED_BY_CORRECTION");
  // CL-190 (rohan's original "12") is withdrawn by the correction. CL-191
  // (meera, "8") was never wrong and stays live; CL-192 (rohan, "8") is
  // rohan's corrected position — both now agree, so both remain live.
  assert.deepEqual(bucket2.liveClaims.map((c) => c.claim_id).sort(), ["CL-191", "CL-192"]);
  const cl190AfterCorrection = bucket2.claims.find((bc) => bc.claim.claim_id === "CL-190")!;
  assert.notEqual(cl190AfterCorrection.state, "live");
});

// ---------------------------------------------------------------------------
// N9 — compatible claims, no conflict at all
// ---------------------------------------------------------------------------

test("N9: two unrelated single-claim buckets both resolve COMPATIBLE via R6/R7", () => {
  const cl180a = claim({
    claim_id: "CL-180a", message_id: "M-180", referent: "indep_event.duration",
    value: "7 days from go-live", asserter: "priya.raghunathan",
    timestamp: parseInstant("2026-07-08T10:05:00+05:30"), source_span: "seven days from go-live",
  });
  const cl180b = claim({
    claim_id: "CL-180b", message_id: "M-180", referent: "config_freeze.owner",
    value: "meera.iyer", asserter: "priya.raghunathan",
    timestamp: parseInstant("2026-07-08T10:05:00+05:30"), source_span: "Meera owns the config freeze",
  });
  const { buckets } = projectAsOf([cl180a, cl180b], EVAL_AS_OF_DEFAULT, cast, NO_CONTESTED);
  const durationBucket = buckets.find((b) => b.referent === "indep_event.duration")!;
  const ownerBucket = buckets.find((b) => b.referent === "config_freeze.owner")!;
  assert.equal(durationBucket.preRuleVerdict, "COMPATIBLE");
  assert.equal(ownerBucket.preRuleVerdict, "COMPATIBLE");
});

// ---------------------------------------------------------------------------
// C9 — contested marker
// ---------------------------------------------------------------------------

test("C9: reward_config.live_state is marked contested when in the contested set", () => {
  const cl080 = claim({
    claim_id: "CL-080", message_id: "M-080", referent: "reward_config.live_state",
    value: "old table visible", asserter: "deepak.menon",
    timestamp: parseInstant("2026-07-23T13:20:00+05:30"), source_span: "still seeing the old Holi reward table",
  });
  const cl081 = claim({
    claim_id: "CL-081", message_id: "M-081", referent: "reward_config.live_state",
    value: "new config live", asserter: "meera.iyer",
    timestamp: parseInstant("2026-07-23T13:52:00+05:30"), source_span: "updated on the 18th. It's live",
  });
  const contested = new Set(["reward_config.live_state"]);
  const { buckets } = projectAsOf([cl080, cl081], EVAL_AS_OF_DEFAULT, cast, contested);
  const bucket = buckets.find((b) => b.referent === "reward_config.live_state")!;
  assert.equal(bucket.contested, true);
  const r8 = bucket.preRuleTrace.find((t) => t.rule === "R8_contested_marker");
  assert.ok(r8);
  assert.equal(r8!.decidesVerdict, "CONTESTED");
});

// ---------------------------------------------------------------------------
// N3 — ambiguity buckets via buildAmbiguityBuckets
// ---------------------------------------------------------------------------

test("N3: buildAmbiguityBuckets emits a cross-referent bucket without disturbing the member buckets", () => {
  const cl120 = claim({
    claim_id: "CL-120", message_id: "M-120", referent: "soft_launch.date", raw_referent: "launch date",
    value: "2026-08-05", asserter: "arjun.rao",
    timestamp: parseInstant("2026-07-13T10:20:00+05:30"), source_span: "Launch is the 5th",
  });
  const cl121b = claim({
    claim_id: "CL-121", message_id: "M-121", referent: "indep_event.launch_date", raw_referent: "launch date",
    value: "2026-08-15", asserter: "priya.raghunathan",
    timestamp: parseInstant("2026-07-13T10:44:00+05:30"), source_span: "Launch is the 15th",
  });
  const { buckets } = projectAsOf([cl120, cl121b], EVAL_AS_OF_DEFAULT, cast, NO_CONTESTED);
  const contextByMessageId = new Map([
    ["M-120", { thread_id: "T1", channel: "#liveops-ludojunction" }],
    ["M-121", { thread_id: "T1", channel: "#liveops-ludojunction" }],
  ]);
  const ambiguityBuckets = buildAmbiguityBuckets(buckets, EVAL_AS_OF_DEFAULT, contextByMessageId);

  assert.equal(ambiguityBuckets.length, 1);
  assert.equal(ambiguityBuckets[0]!.referent, "indep_event.launch_date|soft_launch.date");
  assert.equal(ambiguityBuckets[0]!.preRuleVerdict, "AMBIGUOUS_REFERENT");

  // Member buckets are untouched — each keeps its own single live claim.
  const softBucket = buckets.find((b) => b.referent === "soft_launch.date")!;
  const indepBucket = buckets.find((b) => b.referent === "indep_event.launch_date")!;
  assert.deepEqual(softBucket.liveClaims.map((c) => c.claim_id), ["CL-120"]);
  assert.deepEqual(indepBucket.liveClaims.map((c) => c.claim_id), ["CL-121"]);
});

// ---------------------------------------------------------------------------
// Determinism and idempotency
// ---------------------------------------------------------------------------

test("projectAsOf never mutates its input claims array", () => {
  const claimsCopy = [...FLAGSHIP_CLAIMS];
  projectAsOf(FLAGSHIP_CLAIMS, AS_OF_18_JUL, cast, NO_CONTESTED);
  assert.deepEqual(FLAGSHIP_CLAIMS, claimsCopy);
});

test("projectAsOf is deterministic across repeated calls with the same input", () => {
  const a = projectAsOf(FLAGSHIP_CLAIMS, AS_OF_18_JUL, cast, NO_CONTESTED);
  const b = projectAsOf(FLAGSHIP_CLAIMS, AS_OF_18_JUL, cast, NO_CONTESTED);
  assert.deepEqual(a, b);
});

test("buckets are stably sorted by referent key", () => {
  const { buckets } = projectAsOf(FLAGSHIP_CLAIMS, AS_OF_18_JUL, cast, NO_CONTESTED);
  const keys = buckets.map((b) => b.referent);
  assert.deepEqual(keys, [...keys].sort());
});

// ---------------------------------------------------------------------------
// Watermark (C4) — cold start vs steady state
// ---------------------------------------------------------------------------

test("advanceWatermark: an empty watermark advances to the latest processed message", () => {
  const now = EVAL_AS_OF_DEFAULT;
  const empty = emptyWatermark(now);
  const advanced = advanceWatermark(
    empty,
    [
      { id: "M-001", timestamp: parseInstant("2026-07-06T10:12:00+05:30") },
      { id: "M-002", timestamp: parseInstant("2026-07-15T18:22:00+05:30") },
    ],
    now,
  );
  assert.equal(advanced.lastMessageId, "M-002");
  assert.equal(advanced.lastTimestamp, "2026-07-15T18:22:00+05:30");
  assert.deepEqual(advanced.processedMessageIds, ["M-001", "M-002"]);
});

test("advanceWatermark is idempotent: re-processing the same batch does not change lastMessageId or duplicate ids", () => {
  const now = EVAL_AS_OF_DEFAULT;
  const batch = [{ id: "M-001", timestamp: parseInstant("2026-07-06T10:12:00+05:30") }];
  const first = advanceWatermark(emptyWatermark(now), batch, now);
  const second = advanceWatermark(first, batch, now);
  assert.equal(second.lastMessageId, "M-001");
  assert.deepEqual(second.processedMessageIds, ["M-001"]);
});

test("advanceWatermark never regresses lastTimestamp when a re-run includes an older message", () => {
  const now = EVAL_AS_OF_DEFAULT;
  const first = advanceWatermark(
    emptyWatermark(now),
    [{ id: "M-002", timestamp: parseInstant("2026-07-15T18:22:00+05:30") }],
    now,
  );
  // A later batch that (for whatever reason) re-includes an earlier message
  // must not move lastTimestamp backwards.
  const second = advanceWatermark(
    first,
    [{ id: "M-001", timestamp: parseInstant("2026-07-06T10:12:00+05:30") }],
    now,
  );
  assert.equal(second.lastTimestamp, "2026-07-15T18:22:00+05:30");
  assert.equal(second.lastMessageId, "M-002");
  assert.deepEqual(second.processedMessageIds, ["M-001", "M-002"]);
});

test("advanceWatermark does not mutate the input watermark", () => {
  const now = EVAL_AS_OF_DEFAULT;
  const empty = emptyWatermark(now);
  const snapshot = JSON.stringify(empty);
  advanceWatermark(empty, [{ id: "M-001", timestamp: now }], now);
  assert.equal(JSON.stringify(empty), snapshot);
});

// ---------------------------------------------------------------------------
// Suppression (C3) — dismiss persists, re-raises only on live-set change
// ---------------------------------------------------------------------------

test("dismissBucket captures the live claim set at the moment of dismissal", () => {
  const { buckets } = projectAsOf(FLAGSHIP_CLAIMS, AS_OF_15_JUL, cast, NO_CONTESTED);
  const bucket = buckets.find((b) => b.referent === "indep_event.launch_date")!;
  const suppression = dismissBucket(bucket, "meera.iyer", EVAL_AS_OF_DEFAULT, "known tradeoff, revisit later");
  assert.equal(suppression.bucket_key, "indep_event.launch_date");
  assert.deepEqual(suppression.claimIdsAtDismissal, ["CL-001", "CL-002"]);
  assert.equal(suppression.dismissedBy, "meera.iyer");
});

test("isSuppressed: a dismissed bucket stays hidden while its live claim set is unchanged", () => {
  const { buckets } = projectAsOf(FLAGSHIP_CLAIMS, AS_OF_15_JUL, cast, NO_CONTESTED);
  const bucket = buckets.find((b) => b.referent === "indep_event.launch_date")!;
  const suppression = dismissBucket(bucket, "meera.iyer", EVAL_AS_OF_DEFAULT);
  assert.equal(isSuppressed(bucket, [suppression]), true);
});

test("isSuppressed: re-raises the moment the live claim set changes (new claim lands)", () => {
  const { buckets: before } = projectAsOf(FLAGSHIP_CLAIMS, AS_OF_15_JUL, cast, NO_CONTESTED);
  const bucketBefore = before.find((b) => b.referent === "indep_event.launch_date")!;
  const suppression = dismissBucket(bucketBefore, "meera.iyer", EVAL_AS_OF_DEFAULT);

  // Move the as-of forward: CL-110 (the studio head's authoritative claim)
  // lands, changing the live claim set from [CL-001, CL-002] to [CL-110].
  const { buckets: after } = projectAsOf(FLAGSHIP_CLAIMS, AS_OF_18_JUL, cast, NO_CONTESTED);
  const bucketAfter = after.find((b) => b.referent === "indep_event.launch_date")!;

  assert.equal(isSuppressed(bucketAfter, [suppression]), false);
});

test("isSuppressed: a bucket with no suppressions is never suppressed", () => {
  const { buckets } = projectAsOf(FLAGSHIP_CLAIMS, AS_OF_15_JUL, cast, NO_CONTESTED);
  const bucket = buckets.find((b) => b.referent === "indep_event.launch_date")!;
  assert.equal(isSuppressed(bucket, []), false);
});
