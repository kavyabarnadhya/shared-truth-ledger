/**
 * The ledger is a fold over time, not a diff. `projectAsOf` takes the full
 * claim set and a fixed instant and produces buckets whose live/superseded/
 * withdrawn state reflects exactly what was true at that instant — nothing
 * mutates, so calling this with two different `asOf` values on the same
 * claims is what produces the flagship bucket's two different verdicts (see
 * the module-level test in ledger.test.ts).
 */

import type {
  Bucket,
  BucketClaim,
  Claim,
  CastEntry,
  Message,
  PreRuleFiring,
  Resolution,
  Suppression,
  VerdictKind,
  Watermark,
} from "./types.ts";
import { isSameOrBefore, type Instant } from "./time.ts";
import { compareStrings, chain, byKey } from "./util/stable-sort.ts";
import { applyPreRules } from "./prerules.ts";
import { detectAmbiguityPairs, type AmbiguityCandidateClaim } from "./referent.ts";

const byTimestampThenId = chain<Claim>(
  (a, b) => compareStrings(a.timestamp, b.timestamp),
  byKey((c) => c.claim_id),
);

export interface ProjectAsOfResult {
  buckets: Bucket[];
  /** True when a bucket's single surviving live claim is the tail of an R2 same-asserter chain (-> UPDATE, not COMPATIBLE). */
  updateBucketKeys: Set<string>;
}

/**
 * Groups claims by canonical referent, then within each bucket:
 *   1. filters to timestamp <= asOf (later claims are "not_yet_asserted",
 *      i.e. simply absent from this projection);
 *   2. sorts by (timestamp asc, claim_id asc) — the stable order every
 *      pre-rule and every downstream consumer relies on;
 *   3. runs the deterministic pre-rule ladder (prerules.ts) to assign
 *      ClaimState and, where possible, decide the verdict outright.
 */
export function projectAsOf(
  claims: readonly Claim[],
  asOf: Instant,
  cast: readonly CastEntry[],
  contestedReferents: ReadonlySet<string>,
): ProjectAsOfResult {
  const byReferent = new Map<string, Claim[]>();
  for (const claim of claims) {
    if (!isSameOrBefore(claim.timestamp, asOf)) continue; // not_yet_asserted at this asOf
    const arr = byReferent.get(claim.referent) ?? [];
    arr.push(claim);
    byReferent.set(claim.referent, arr);
  }

  const buckets: Bucket[] = [];
  const updateBucketKeys = new Set<string>();

  for (const [referent, referentClaims] of byReferent) {
    const sorted = [...referentClaims].sort(byTimestampThenId);
    const { ranked, trace, preRuleVerdict, contested } = applyPreRules(sorted, cast, contestedReferents);

    const bucketClaims: BucketClaim[] = ranked.map((r) => ({
      claim: r.claim,
      state: r.state,
      stateReason: r.stateReason,
      supersededBy: r.supersededBy,
    }));

    const liveClaims = bucketClaims.filter((bc) => bc.state === "live").map((bc) => bc.claim);

    // Distinguish "this bucket always had one claim" (-> COMPATIBLE) from
    // "an R2 same-asserter chain collapsed to one survivor" (-> UPDATE): the
    // latter is true iff at least one claim was superseded specifically by
    // rule R2 in this bucket and no stronger verdict (R4/R5) already fired.
    const hadR2Supersession = trace.some((t) => t.rule === "R2_same_asserter_update");
    const noStrongerVerdictFired = trace.every(
      (t) => t.rule !== "R4_self_correction" && t.rule !== "R5_authoritative_supersession",
    );
    if (liveClaims.length === 1 && hadR2Supersession && noStrongerVerdictFired && !contested) {
      updateBucketKeys.add(referent);
    }

    buckets.push({
      referent,
      claims: bucketClaims,
      liveClaims,
      asOf,
      preRuleTrace: trace,
      preRuleVerdict,
      linkedReferents: [],
      contested,
    });
  }

  buckets.sort((a, b) => compareStrings(a.referent, b.referent));
  return { buckets, updateBucketKeys };
}

/** Per-claim context the ambiguity detector needs but Claim itself doesn't carry (it lives on Message). */
export interface ClaimContext {
  thread_id: string;
  channel?: string;
}

/**
 * Runs the N3 cross-referent ambiguity detector over a projected set of
 * buckets and returns additional synthetic buckets representing each
 * detected pair. These are ADDITIONAL to the members' own buckets — neither
 * `soft_launch.date` nor `indep_event.launch_date` loses its claims or its
 * own verdict; the pair bucket exists only to carry the AMBIGUOUS_REFERENT
 * signal.
 *
 * `contextByMessageId` supplies the thread/channel each claim's source
 * message belongs to — Claim itself doesn't carry that (it lives on
 * Message), and the detector needs it to confirm "same conversation" rather
 * than just "same 24h window".
 */
export function buildAmbiguityBuckets(
  buckets: readonly Bucket[],
  asOf: Instant,
  contextByMessageId: ReadonlyMap<string, ClaimContext>,
): Bucket[] {
  const claimsByReferent = new Map<string, AmbiguityCandidateClaim[]>();
  for (const bucket of buckets) {
    claimsByReferent.set(
      bucket.referent,
      bucket.liveClaims.map((c) => {
        const ctx = contextByMessageId.get(c.message_id);
        return {
          claim_id: c.claim_id,
          referent: c.referent,
          raw_referent: c.raw_referent,
          value: c.value,
          timestamp: c.timestamp,
          thread_id: ctx?.thread_id ?? "",
          channel: ctx?.channel,
        };
      }),
    );
  }

  const pairs = detectAmbiguityPairs(claimsByReferent);
  const out: Bucket[] = [];
  for (const pair of pairs) {
    const memberA = buckets.find((b) => b.referent === pair.a.referent);
    const memberB = buckets.find((b) => b.referent === pair.b.referent);
    const linked = [pair.a.referent, pair.b.referent].sort();
    out.push({
      referent: pair.bucketKey,
      claims: [
        ...(memberA?.claims.filter((bc) => bc.claim.claim_id === pair.a.claim_id) ?? []),
        ...(memberB?.claims.filter((bc) => bc.claim.claim_id === pair.b.claim_id) ?? []),
      ],
      liveClaims: [
        ...(memberA?.liveClaims.filter((c) => c.claim_id === pair.a.claim_id) ?? []),
        ...(memberB?.liveClaims.filter((c) => c.claim_id === pair.b.claim_id) ?? []),
      ],
      asOf,
      preRuleTrace: [
        {
          rule: "R9_ambiguity_pair",
          claimIds: [pair.a.claim_id, pair.b.claim_id],
          effect: `${pair.a.referent} and ${pair.b.referent} both surface as "${pair.a.raw_referent}" within 24h, different values -> AMBIGUOUS_REFERENT`,
          decidesVerdict: "AMBIGUOUS_REFERENT" as VerdictKind,
        },
      ],
      preRuleVerdict: "AMBIGUOUS_REFERENT",
      linkedReferents: linked,
      contested: false,
    });
  }
  out.sort((a, b) => compareStrings(a.referent, b.referent));
  return out;
}

export type { PreRuleFiring, Suppression, Resolution };

// ---------------------------------------------------------------------------
// Watermark (C4) — cold start vs steady state
// ---------------------------------------------------------------------------

/**
 * Advances the ingest watermark past a batch of newly-processed messages.
 * Pure and idempotent: re-running it with a message id already in
 * `processedMessageIds` is a no-op for that id, so replaying the same batch
 * (e.g. after a crash mid-run) never double-counts or corrupts the
 * watermark. Only messages that were actually processed successfully should
 * be passed in — the caller advances on success only, never speculatively.
 */
export function advanceWatermark(
  current: Watermark,
  processedMessages: readonly Pick<Message, "id" | "timestamp">[],
  now: Instant,
): Watermark {
  const seen = new Set(current.processedMessageIds);
  for (const m of processedMessages) seen.add(m.id);

  const allProcessedIds = [...seen].sort();
  const sortedByTime = [...processedMessages].sort((a, b) => compareStrings(a.timestamp, b.timestamp));
  const latestNew = sortedByTime[sortedByTime.length - 1];

  const lastTimestamp =
    !latestNew || (current.lastTimestamp && compareStrings(current.lastTimestamp, latestNew.timestamp) >= 0)
      ? current.lastTimestamp
      : latestNew.timestamp;
  const lastMessageId =
    !latestNew || (current.lastTimestamp && compareStrings(current.lastTimestamp, latestNew.timestamp) >= 0)
      ? current.lastMessageId
      : latestNew.id;

  return {
    lastMessageId,
    lastTimestamp,
    processedMessageIds: allProcessedIds,
    advancedAt: now,
  };
}

export function emptyWatermark(now: Instant): Watermark {
  return { lastMessageId: null, lastTimestamp: null, processedMessageIds: [], advancedAt: now };
}

// ---------------------------------------------------------------------------
// Suppression (C3) — dismissals persist and re-raise only on change
// ---------------------------------------------------------------------------

/**
 * A bucket that was dismissed stays hidden from the Contradictions tab only
 * while its live claim set is unchanged from the moment of dismissal. The
 * instant a new claim changes that set — the disagreement moved — the
 * dismissal no longer applies and the bucket surfaces again. This is what
 * keeps "dismiss" from becoming "silence forever": the system re-raises
 * exactly when there is something new to look at, not on a timer.
 */
export function isSuppressed(bucket: Bucket, suppressions: readonly Suppression[]): boolean {
  const relevant = suppressions.filter((s) => s.bucket_key === bucket.referent);
  if (relevant.length === 0) return false;
  const currentLiveIds = [...bucket.liveClaims.map((c) => c.claim_id)].sort();
  return relevant.some((s) => {
    const dismissedIds = [...s.claimIdsAtDismissal].sort();
    return JSON.stringify(dismissedIds) === JSON.stringify(currentLiveIds);
  });
}

export function dismissBucket(
  bucket: Bucket,
  dismissedBy: string,
  now: Instant,
  reason: string | null = null,
): Suppression {
  return {
    bucket_key: bucket.referent,
    asOf: bucket.asOf,
    dismissedAt: now,
    dismissedBy,
    reason,
    claimIdsAtDismissal: [...bucket.liveClaims.map((c) => c.claim_id)].sort(),
  };
}

// ---------------------------------------------------------------------------
// Resolution (Part D) — manual "who won" record, same shape/lifecycle as
// Suppression. This is a human annotation stored alongside the system's own
// verdict, not a replacement for it: it does not feed back into
// projectAsOf or any pre-rule/verdict computation above.
// ---------------------------------------------------------------------------

export function resolveBucket(
  bucket: Bucket,
  resolvedBy: string,
  now: Instant,
  winningAsserter: string | null = null,
  note: string | null = null,
): Resolution {
  return {
    bucket_key: bucket.referent,
    asOf: bucket.asOf,
    resolvedAt: now,
    resolvedBy,
    winningAsserter,
    note,
    claimIdsAtResolution: [...bucket.liveClaims.map((c) => c.claim_id)].sort(),
  };
}

/**
 * Same re-raise-on-change semantics as isSuppressed: a resolution recorded
 * against one live-claim set no longer applies once that set changes —
 * "resolved" isn't a stale label once the underlying disagreement has moved.
 */
export function isResolved(bucket: Bucket, resolutions: readonly Resolution[]): boolean {
  const relevant = resolutions.filter((r) => r.bucket_key === bucket.referent);
  if (relevant.length === 0) return false;
  const currentLiveIds = [...bucket.liveClaims.map((c) => c.claim_id)].sort();
  return relevant.some((r) => {
    const resolvedIds = [...r.claimIdsAtResolution].sort();
    return JSON.stringify(resolvedIds) === JSON.stringify(currentLiveIds);
  });
}
