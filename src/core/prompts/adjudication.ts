/**
 * Adjudication prompt. Two variants selected by JudgeScope:
 *   - "binary" (primary, recorded): the model answers exactly one question —
 *     are these live claims mutually incompatible? Everything else
 *     (UPDATE, RESOLVED_BY_*, AMBIGUOUS_REFERENT) is decided by pre-rules
 *     before the model ever sees the bucket. This is the best available
 *     hedge against a weak judge without tuning prompts around it.
 *   - "full7": the model emits the entire 7-way vocabulary. Recorded as the
 *     phase-3 judge-scope comparison — since this build stays on the free
 *     tier for both configs, this is the axis actually measured instead of
 *     a cheap-vs-strong model delta.
 *
 * Told which claims are live and that superseded/withdrawn/reported claims
 * were already removed — the model is never asked to reason about a claim
 * pre-rules have already retired.
 *
 * A third variant, BINARY_ESCALATED_SYSTEM, backs the confidence-gated
 * escalation router in pipeline.ts: same binary question and schema, but
 * asks the model to reason step by step before committing to a verdict.
 * Used only as a second call, only when the primary binary call's
 * self-reported confidence comes back below ESCALATION_CONFIDENCE_THRESHOLD.
 * Still free tier — see model/config.ts.
 */

import type { Bucket, JudgeScope } from "../types.ts";
import { formatIST } from "../time.ts";

// Bumped from 1 -> 2: BINARY_SYSTEM below now asks the model to self-report
// confidence, which the escalation router (router.ts, pipeline.ts) gates
// on. This intentionally invalidates the ~20 previously-committed
// binary-scope adjudication recordings (their promptSha no longer matches)
// -- they are re-recorded as part of this change via `npm run record`.
// full7's recordings and PROMPT_VERSION's role in extraction's cache keys
// are untouched: FULL7_SYSTEM's text does not change, and extraction uses
// its own separate PROMPT_VERSION in prompts/extraction.ts.
export const PROMPT_VERSION = 2;

/**
 * Separate version counter for the escalated prompt's cache keys only.
 * Folded into the escalated call's cache key (see pipeline.ts passing
 * `promptVersion: ADJUDICATION_PROMPT.ESCALATED_PROMPT_VERSION` on that
 * specific request) so bumping it invalidates only escalated-rung
 * recordings without touching PROMPT_VERSION's primary-binary/full7 keys.
 */
export const ESCALATED_PROMPT_VERSION = 1;

const BINARY_SYSTEM = `Decide whether a set of live claims are mutually incompatible statements about the same thing.

Two claims are incompatible if they cannot both be true at the same time. Differences in emphasis, scope, or wording are not incompatibility.

You are told which claims are live. Claims that were superseded, withdrawn, or reported have already been removed from what you see — do not reason about them or try to reconstruct them.

Output "CONTRADICTION" if the live claims conflict, "COMPATIBLE" if they do not. Also self-report your confidence in this verdict as a number from 0 (guessing) to 1 (certain).

Output JSON only, matching this schema exactly:
{"verdict": "CONTRADICTION"|"COMPATIBLE", "rationale": string, "conflicting_claim_ids": string[], "confidence": number}
"conflicting_claim_ids" should list the claim ids that are in conflict, or an empty array if COMPATIBLE.`;

const BINARY_ESCALATED_SYSTEM = `Decide whether a set of live claims are mutually incompatible statements about the same thing.

Two claims are incompatible if they cannot both be true at the same time. Differences in emphasis, scope, or wording are not incompatibility.

You are told which claims are live. Claims that were superseded, withdrawn, or reported have already been removed from what you see — do not reason about them or try to reconstruct them.

This case was flagged as low-confidence on a first pass. Think through it step by step before committing to a verdict: restate what each live claim asserts in your own words, check whether they actually describe the same referent and the same point in time, and only then decide whether they can both be true simultaneously. Put that reasoning in "rationale" — it may be longer than usual.

Output "CONTRADICTION" if the live claims conflict, "COMPATIBLE" if they do not. Also self-report your confidence in this verdict as a number from 0 (guessing) to 1 (certain).

Output JSON only, matching this schema exactly:
{"verdict": "CONTRADICTION"|"COMPATIBLE", "rationale": string, "conflicting_claim_ids": string[], "confidence": number}
"conflicting_claim_ids" should list the claim ids that are in conflict, or an empty array if COMPATIBLE.`;

const FULL7_SYSTEM = `Decide the relationship between a set of live claims about the same referent.

You are told which claims are live. Claims that were superseded, withdrawn, or reported have already been removed from what you see.

Choose exactly one verdict:
- "CONTRADICTION": two or more live claims from different people conflict and neither has been resolved.
- "UPDATE": a single person's claim has simply been revised over time.
- "RESOLVED_BY_SUPERSESSION": a higher-authority person's claim has settled an earlier conflict.
- "RESOLVED_BY_CORRECTION": someone withdrew their own claim in favor of someone else's.
- "AMBIGUOUS_REFERENT": the claims only appear to conflict because they are actually about different things.
- "COMPATIBLE": the live claims do not conflict.
- "CONTESTED": reasonable people could disagree about whether this is a conflict at all.

Output JSON only, matching this schema exactly:
{"verdict": "CONTRADICTION"|"UPDATE"|"RESOLVED_BY_SUPERSESSION"|"RESOLVED_BY_CORRECTION"|"AMBIGUOUS_REFERENT"|"COMPATIBLE"|"CONTESTED", "rationale": string, "conflicting_claim_ids": string[]}`;

export function systemFor(judgeScope: JudgeScope): string {
  return judgeScope === "binary" ? BINARY_SYSTEM : FULL7_SYSTEM;
}

export interface AdjudicationPromptInput {
  bucket: Bucket;
  judgeScope: JudgeScope;
}

export function renderUser(input: AdjudicationPromptInput): string {
  const { bucket } = input;
  const rows = bucket.liveClaims
    .map(
      (c) =>
        `- ${c.claim_id} | ${c.asserter} | ${formatIST(c.timestamp)} | value: "${c.value}" | span: "${c.source_span}"`,
    )
    .join("\n");
  return `Referent: ${bucket.referent}\n\nLive claims:\n${rows}`;
}

export const ADJUDICATION_PROMPT = {
  get SYSTEM(): string {
    // Default to binary; pipeline.ts calls systemFor(judgeScope) directly
    // when it needs the scope-specific variant. This getter exists only so
    // ADJUDICATION_PROMPT.SYSTEM has a sane value for code that doesn't
    // thread judgeScope through (e.g. a generic "view prompt" preview).
    return BINARY_SYSTEM;
  },
  systemFor,
  renderUser,
  PROMPT_VERSION,
  BINARY_ESCALATED_SYSTEM,
  ESCALATED_PROMPT_VERSION,
} as const;
