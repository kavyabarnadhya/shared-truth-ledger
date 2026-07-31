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
 */

import type { Bucket, JudgeScope } from "../types.ts";
import { formatIST } from "../time.ts";

export const PROMPT_VERSION = 1;

const BINARY_SYSTEM = `Decide whether a set of live claims are mutually incompatible statements about the same thing.

Two claims are incompatible if they cannot both be true at the same time. Differences in emphasis, scope, or wording are not incompatibility.

You are told which claims are live. Claims that were superseded, withdrawn, or reported have already been removed from what you see — do not reason about them or try to reconstruct them.

Output "CONTRADICTION" if the live claims conflict, "COMPATIBLE" if they do not.

Output JSON only, matching this schema exactly:
{"verdict": "CONTRADICTION"|"COMPATIBLE", "rationale": string, "conflicting_claim_ids": string[]}
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
} as const;
