/**
 * Deterministic pre-rules. Run on a bucket's as-of-visible claims, before
 * any adjudication model call. Every firing appends a PreRuleFiring; the
 * ordering below is fixed and is what the drill-down renders.
 *
 * What is left for the model (see ledger.ts's bucket assembly and
 * pipeline.ts): exactly one question, on buckets that reach it with >=2 live
 * claims from >=2 distinct asserters — "are these live claims mutually
 * incompatible about the same thing?" The model cannot emit UPDATE,
 * RESOLVED_BY_*, or AMBIGUOUS_REFERENT; those are pre-rules' job, and the
 * adjudication schema doesn't allow the model to emit them (see
 * schema/verdict.ts). This narrows the free model's task to a binary
 * judgement — the best available hedge against a weak judge without tuning
 * prompts around it.
 */

import type { Claim, ClaimState, PreRuleFiring, VerdictKind, CastEntry } from "./types.ts";
import { isSameOrBefore } from "./time.ts";

export interface RankedClaim {
  claim: Claim;
  state: ClaimState;
  stateReason: string;
  supersededBy: string | null;
}

export interface PreRuleResult {
  ranked: RankedClaim[];
  trace: PreRuleFiring[];
  /** Set only when a pre-rule fully decides the verdict without a model call. */
  preRuleVerdict: VerdictKind | null;
  contested: boolean;
}

/**
 * Applies R0(pre-bucket, handled by the caller via span_valid)-R8 to the
 * claims of a single referent bucket, already filtered to `timestamp <= asOf`
 * and sorted by (timestamp asc, claim_id asc) by the caller (ledger.ts).
 */
export function applyPreRules(
  claimsAsOf: readonly Claim[],
  cast: readonly CastEntry[],
  contestedReferents: ReadonlySet<string>,
): PreRuleResult {
  const trace: PreRuleFiring[] = [];
  const authorityByHandle = new Map(cast.map((c) => [c.handle, c.authority_rank]));

  // Start every claim "live"; rules below narrow that down. Claims are
  // processed in the caller's stable (timestamp, claim_id) order, so "later"
  // always means "later in this array" and superseded-by ids point forward
  // in time, never backward.
  const ranked: RankedClaim[] = claimsAsOf.map((claim) => ({
    claim,
    state: "live" as ClaimState,
    stateReason: "no pre-rule applied yet",
    supersededBy: null,
  }));

  // R1: reported speech is excluded outright — the asserter is not making
  // the claim, so it can never create or resolve a contradiction.
  for (const r of ranked) {
    if (r.claim.modality === "reported") {
      r.state = "excluded_reported";
      r.stateReason = `reported speech (attributed to ${r.claim.attributed_to ?? "unknown"}), excluded from adjudication`;
      trace.push({
        rule: "R1_reported_speech_exclusion",
        claimIds: [r.claim.claim_id],
        effect: `${r.claim.claim_id} excluded (reported, attributed_to=${r.claim.attributed_to ?? "null"})`,
        decidesVerdict: null,
      });
    }
  }

  // R1b: hedges/proposals/questions never register as claims in the first
  // place (the extractor shouldn't emit them, and pipeline.ts drops them
  // into rejectedClaims before they reach a bucket at all) — but if one
  // slips through, treat it the same way here rather than let it silently
  // participate as a live position.
  for (const r of ranked) {
    if (r.state === "live" && (r.claim.modality === "hedge" || r.claim.modality === "proposal" || r.claim.modality === "question")) {
      r.state = "withdrawn";
      r.stateReason = `modality "${r.claim.modality}" is not a first-party assertion`;
      trace.push({
        rule: "R1b_non_claim_exclusion",
        claimIds: [r.claim.claim_id],
        effect: `${r.claim.claim_id} excluded (modality=${r.claim.modality})`,
        decidesVerdict: null,
      });
    }
  }

  // R3: negative polarity. A negative claim asserts NOT value — it must not
  // be read as asserting `value` itself. If this asserter already has (or
  // will register) a live positive claim, the negative claim is consistent
  // with it and contributes no new position. If they have no positive claim
  // in this bucket, the negative claim becomes the asserter's live position,
  // displayed as "NOT <value>" — still processed by R2/R4/R5 like any other
  // live claim, just never treated as asserting the literal `value`.
  for (const r of ranked) {
    if (r.state !== "live" || r.claim.polarity !== "negative") continue;
    const positiveSameAsserter = ranked.find(
      (o) =>
        o !== r &&
        o.claim.asserter === r.claim.asserter &&
        o.claim.polarity === "positive" &&
        (o.state === "live" || o.state === "superseded"),
    );
    if (positiveSameAsserter) {
      r.state = "withdrawn";
      r.stateReason = `negative polarity, consistent with ${positiveSameAsserter.claim.claim_id} (${r.claim.asserter}'s live positive position)`;
      trace.push({
        rule: "R3_negative_polarity_guard",
        claimIds: [r.claim.claim_id, positiveSameAsserter.claim.claim_id],
        effect: `${r.claim.claim_id} (negative) does not register value "${r.claim.value}"; consistent with ${positiveSameAsserter.claim.claim_id}`,
        decidesVerdict: null,
      });
    } else {
      trace.push({
        rule: "R3_negative_polarity_guard",
        claimIds: [r.claim.claim_id],
        effect: `${r.claim.claim_id} negative polarity retained as live claim "NOT ${r.claim.value}" (no positive counterpart from ${r.claim.asserter} in this bucket)`,
        decidesVerdict: null,
      });
    }
  }

  // R2: same-asserter update. Walk claims in order; when a later live claim
  // shares an asserter with an earlier live claim, the earlier one is
  // superseded — regardless of whether the value changed (a same-value
  // restatement still means the earlier message is no longer this
  // asserter's most current word on the subject).
  for (let i = 0; i < ranked.length; i++) {
    const earlier = ranked[i]!;
    if (earlier.state !== "live") continue;
    for (let j = i + 1; j < ranked.length; j++) {
      const later = ranked[j]!;
      if (later.state !== "live") continue;
      if (later.claim.asserter !== earlier.claim.asserter) continue;
      earlier.state = "superseded";
      earlier.supersededBy = later.claim.claim_id;
      earlier.stateReason = `superseded by ${later.claim.claim_id} (same asserter, later)`;
      trace.push({
        rule: "R2_same_asserter_update",
        claimIds: [earlier.claim.claim_id, later.claim.claim_id],
        effect: `${earlier.claim.claim_id} -> superseded by ${later.claim.claim_id}`,
        decidesVerdict: null,
      });
      break; // earlier is now resolved; move to the next earlier claim
    }
  }

  // R4: self-correction. Asserter A claimed X; a different asserter B holds
  // a live claim with a different value; A later asserts B's value. A's
  // earlier claim is withdrawn (not merely superseded — A is retracting
  // their own prior position, not just updating a timestamp), and the
  // bucket resolves to RESOLVED_BY_CORRECTION provided no other conflicting
  // live claim remains.
  let r4Fired = false;
  for (let i = 0; i < ranked.length; i++) {
    const laterSameValueAsOther = ranked[i]!;
    if (laterSameValueAsOther.state !== "live") continue;
    for (let k = 0; k < i; k++) {
      const earlierOwn = ranked[k]!;
      if (earlierOwn.claim.asserter !== laterSameValueAsOther.claim.asserter) continue;
      if (earlierOwn.state === "not_yet_asserted") continue;
      if (earlierOwn.claim.value === laterSameValueAsOther.claim.value) continue;
      // is there an intervening different-asserter claim with the value
      // `laterSameValueAsOther` now agrees with?
      const otherAsserterMatch = ranked.find(
        (o) =>
          o !== laterSameValueAsOther &&
          o.claim.asserter !== laterSameValueAsOther.claim.asserter &&
          o.claim.value === laterSameValueAsOther.claim.value &&
          isSameOrBefore(o.claim.timestamp, laterSameValueAsOther.claim.timestamp),
      );
      if (otherAsserterMatch && (earlierOwn.state === "live" || earlierOwn.state === "superseded")) {
        if (earlierOwn.state === "live") {
          earlierOwn.state = "withdrawn";
        }
        earlierOwn.stateReason = `withdrawn: self-correction, ${laterSameValueAsOther.claim.claim_id} adopts ${otherAsserterMatch.claim.claim_id}'s value`;
        trace.push({
          rule: "R4_self_correction",
          claimIds: [earlierOwn.claim.claim_id, laterSameValueAsOther.claim.claim_id, otherAsserterMatch.claim.claim_id],
          effect: `${earlierOwn.claim.claim_id} withdrawn; ${laterSameValueAsOther.claim.claim_id} adopts ${otherAsserterMatch.claim.claim_id}'s value "${otherAsserterMatch.claim.value}"`,
          decidesVerdict: "RESOLVED_BY_CORRECTION",
        });
        r4Fired = true;
      }
    }
  }

  // R5: authoritative supersession. The latest claim in the bucket is by an
  // asserter whose authority_rank is strictly greater than every other live
  // asserter's, at least two conflicting live claims existed immediately
  // before it, and its value matches one of them. All prior live claims are
  // superseded by authority, leaving the authoritative claim as the sole
  // live position.
  let r5Fired = false;
  {
    const liveBeforeLast = ranked.filter((r) => r.state === "live");
    if (liveBeforeLast.length >= 1) {
      const last = liveBeforeLast[liveBeforeLast.length - 1]!;
      const priorLive = liveBeforeLast.slice(0, -1);
      const priorConflicting = new Set(priorLive.map((r) => r.claim.value)).size >= 2;
      const lastRank = authorityByHandle.get(last.claim.asserter) ?? 1;
      const allOthersOutranked = priorLive.every(
        (r) => (authorityByHandle.get(r.claim.asserter) ?? 1) < lastRank,
      );
      const valueMatchesAPrior = priorLive.some((r) => r.claim.value === last.claim.value);
      if (priorLive.length >= 2 && priorConflicting && allOthersOutranked && valueMatchesAPrior) {
        for (const r of priorLive) {
          r.state = "superseded";
          r.supersededBy = last.claim.claim_id;
          r.stateReason = `superseded by authority: ${last.claim.claim_id} (${last.claim.asserter}, rank ${lastRank})`;
        }
        trace.push({
          rule: "R5_authoritative_supersession",
          claimIds: [...priorLive.map((r) => r.claim.claim_id), last.claim.claim_id],
          effect: `${priorLive.map((r) => r.claim.claim_id).join(", ")} superseded by ${last.claim.claim_id} (authority_rank ${lastRank})`,
          decidesVerdict: "RESOLVED_BY_SUPERSESSION",
        });
        r5Fired = true;
      }
    }
  }

  const liveAfterAllRules = ranked.filter((r) => r.state === "live");
  const liveCount = liveAfterAllRules.length;
  const distinctLiveValues = new Set(liveAfterAllRules.map((r) => r.claim.value)).size;
  const referent = claimsAsOf[0]?.referent;
  const contested = referent !== undefined && contestedReferents.has(referent);

  let preRuleVerdict: VerdictKind | null = null;
  if (r5Fired) {
    preRuleVerdict = "RESOLVED_BY_SUPERSESSION";
  } else if (r4Fired && distinctLiveValues <= 1) {
    // R4 fired AND every remaining live claim now agrees on value (whether
    // that's one claim, as in a same-asserter chain, or several claims from
    // different asserters that converged after the correction, as in N10 at
    // 15:40 — CL-191 and CL-192 both read "8" once CL-192 lands). Gating on
    // *distinct values* rather than raw live count is what tells "converged"
    // apart from "still disagreeing" — liveCount alone can't, since R2 only
    // retires a same-asserter predecessor and never touches a different
    // asserter's still-live claim.
    preRuleVerdict = "RESOLVED_BY_CORRECTION";
  } else if (liveCount === 1) {
    // R6: exactly one live claim and no stronger verdict already decided ->
    // COMPATIBLE (or UPDATE, if that single survivor is the result of a
    // same-asserter chain per R2 — see ledger.ts's bucket assembly, which
    // distinguishes "always had one claim" from "R2 collapsed several").
    preRuleVerdict = "COMPATIBLE";
    trace.push({
      rule: "R6_single_live_claim",
      claimIds: ranked.filter((r) => r.state === "live").map((r) => r.claim.claim_id),
      effect: "exactly one live claim remains -> COMPATIBLE",
      decidesVerdict: "COMPATIBLE",
    });
  } else if (liveCount >= 2 && distinctLiveValues <= 1) {
    // R6b: two or more live claims, different asserters, but they all agree
    // on value — this is not a contradiction and should not reach the model
    // as one. (Without this, a same-asserter chain (R2) that leaves a
    // different asserter's matching claim still live — e.g. two people who
    // independently said the same thing — would fall through to "no
    // pre-rule verdict" and force the judge to answer a question that isn't
    // actually in dispute.)
    preRuleVerdict = "COMPATIBLE";
    trace.push({
      rule: "R6b_live_claims_agree",
      claimIds: liveAfterAllRules.map((r) => r.claim.claim_id),
      effect: `${liveCount} live claims, all agree on value "${liveAfterAllRules[0]!.claim.value}" -> COMPATIBLE`,
      decidesVerdict: "COMPATIBLE",
    });
  } else if (liveCount === 0) {
    // R7: bucket emptied out entirely (e.g. every claim was reported speech
    // or withdrawn) -> COMPATIBLE, and the bucket is suppressed from the
    // Contradictions tab by the UI layer (nothing live to contest).
    preRuleVerdict = "COMPATIBLE";
    trace.push({
      rule: "R7_zero_live_claims",
      claimIds: [],
      effect: "no live claims remain -> COMPATIBLE (suppressed from Contradictions)",
      decidesVerdict: "COMPATIBLE",
    });
  }

  if (contested) {
    trace.push({
      rule: "R8_contested_marker",
      claimIds: ranked.map((r) => r.claim.claim_id),
      effect: "referent is in the contested set; verdict will be coerced to CONTESTED regardless of model output",
      decidesVerdict: "CONTESTED",
    });
  }

  return { ranked, trace, preRuleVerdict, contested };
}

/** Distinct asserters among a set of live claims. */
export function distinctAsserters(claims: readonly Claim[]): Set<string> {
  return new Set(claims.map((c) => c.asserter));
}
