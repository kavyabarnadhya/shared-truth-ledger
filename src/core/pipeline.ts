/**
 * The pipeline orchestrator: sources -> noise gate -> extraction ->
 * referent resolution -> pre-rules -> adjudication -> ledger. Pure aside
 * from the injected ModelClient's `call()` (which itself replays from a
 * RecordingStore in every graded context — see model/client.ts).
 *
 * Two entry points, both built on the same primitives:
 *   - `runExtractionPipeline`: raw messages -> predicted claims. This is
 *     what grader A scores.
 *   - `runAdjudicationPipeline`: caller-supplied claims (gold, in eval mode;
 *     the extractor's own output, in the real app) -> resolution -> pre-rules
 *     -> adjudication -> buckets/verdicts. This is what grader B scores when
 *     given gold claims, and what the live app scores when given predicted
 *     claims — same function either way.
 */

import type {
  Claim,
  CastEntry,
  Message,
  ModelClient,
  RejectedClaim,
  TraceEntry,
  VerdictKind,
  Verdict,
  Bucket,
  JudgeScope,
} from "./types.ts";
import type { Instant } from "./time.ts";
import { evaluateNoiseGate } from "./noise-gate.ts";
import { validateSpan } from "./span.ts";
import { resolveReferent } from "./referent.ts";
import { projectAsOf, buildAmbiguityBuckets, type ClaimContext } from "./ledger.ts";
import { EXTRACTION_PROMPT } from "./prompts/extraction.ts";
import { ADJUDICATION_PROMPT } from "./prompts/adjudication.ts";
import { parseExtractionResponse, parseAdjudicationResponse } from "./parse/json-repair.ts";
import { compareStrings } from "./util/stable-sort.ts";
import { ReplayMissError, PromptDriftError } from "./model/client.ts";

/**
 * True for errors that mean "this recording doesn't exist or is stale" —
 * these must propagate all the way out of the pipeline and fail the whole
 * eval run loudly, per the build plan: replay miss is "a hard, visible
 * error... never silent". Only genuinely transient failures (a live network
 * call timing out, a 429) should degrade gracefully per-message/per-bucket;
 * conflating the two would let a missing recording silently masquerade as
 * "the model said nothing usable here" instead of "this run is not
 * reproducible and must not be trusted."
 */
function isHardReplayError(err: unknown): boolean {
  return err instanceof ReplayMissError || err instanceof PromptDriftError;
}

export interface ExtractionRunResult {
  claims: Claim[];
  rejectedClaims: RejectedClaim[];
  gatedMessageIds: string[];
  trace: TraceEntry[];
}

/**
 * Runs the noise gate + extraction over a message set. Context messages (up
 * to 3 preceding same-thread messages) are passed for pronoun disambiguation
 * only — the prompt instructs the model not to infer claims from them, and
 * their ids are part of the cache key so recordings stay stable.
 */
export async function runExtractionPipeline(
  messages: readonly Message[],
  cast: readonly CastEntry[],
  model: ModelClient,
): Promise<ExtractionRunResult> {
  const claims: Claim[] = [];
  const rejectedClaims: RejectedClaim[] = [];
  const gatedMessageIds: string[] = [];
  const trace: TraceEntry[] = [];

  const byThread = new Map<string, Message[]>();
  for (const m of messages) {
    const arr = byThread.get(m.thread_id) ?? [];
    arr.push(m);
    byThread.set(m.thread_id, arr);
  }
  for (const arr of byThread.values()) arr.sort((a, b) => compareStrings(a.timestamp, b.timestamp));

  for (const message of messages) {
    const gate = evaluateNoiseGate(message, cast);
    trace.push({
      id: `noise_gate:${message.id}`,
      step: `noise_gate ${message.id}`,
      kind: "deterministic",
      tier: null,
      model: null,
      mode: "n/a",
      cacheKey: null,
      cacheHit: null,
      tokensIn: null,
      tokensOut: null,
      latencyMs: 0,
      costUsd: null,
      ok: true,
      detail: { rulesFired: gate.rulesFired, gated: gate.gated },
    });
    if (gate.gated) {
      gatedMessageIds.push(message.id);
      continue;
    }

    const threadMessages = byThread.get(message.thread_id) ?? [];
    const idx = threadMessages.findIndex((m) => m.id === message.id);
    const contextIds = threadMessages.slice(Math.max(0, idx - 3), idx).map((m) => m.id);
    const contextMessages = contextIds
      .map((id) => threadMessages.find((m) => m.id === id))
      .filter((m): m is Message => m !== undefined);

    const inputKey = {
      message_id: message.id,
      text: message.text,
      author: message.author,
      author_role: message.author_role,
      timestamp: message.timestamp,
      context_ids: contextIds,
    };
    const user = EXTRACTION_PROMPT.renderUser({ message, contextMessages });

    let response;
    let modelTrace: TraceEntry;
    try {
      const result = await model.call({
        tier: "extraction",
        model: model.config.models.extraction,
        system: EXTRACTION_PROMPT.SYSTEM,
        user,
        temperature: model.config.temperature,
        maxOutputTokens: model.config.maxOutputTokens,
        inputKey,
        step: `extract ${message.id}`,
      });
      response = result.response;
      modelTrace = result.trace;
    } catch (err) {
      if (isHardReplayError(err)) throw err;
      trace.push({
        id: `extract:${message.id}`,
        step: `extract ${message.id}`,
        kind: "model",
        tier: "extraction",
        model: model.config.models.extraction,
        mode: model.mode,
        cacheKey: null,
        cacheHit: null,
        tokensIn: null,
        tokensOut: null,
        latencyMs: 0,
        costUsd: null,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    trace.push(modelTrace);

    const parsed = parseExtractionResponse(response.text);
    if (!parsed.ok) {
      rejectedClaims.push({ message_id: message.id, reason: "schema_invalid", detail: parsed.error, raw: response.text });
      continue;
    }

    let ordinal = 0;
    for (const extracted of parsed.claims) {
      const spanResult = validateSpan(message.text, extracted.source_span);
      if (!spanResult.ok) {
        rejectedClaims.push({
          message_id: message.id,
          reason: "span_not_found",
          detail: `source_span "${extracted.source_span}" not found in message text`,
          raw: extracted,
        });
        continue;
      }
      if (extracted.modality === "hedge" || extracted.modality === "proposal" || extracted.modality === "question") {
        rejectedClaims.push({
          message_id: message.id,
          reason: "non_claim_modality",
          detail: `modality "${extracted.modality}" is not a first-party assertion`,
          raw: extracted,
        });
        continue;
      }
      if (!extracted.referent || extracted.referent.trim().length === 0) {
        rejectedClaims.push({ message_id: message.id, reason: "empty_referent", detail: "empty referent", raw: extracted });
        continue;
      }
      if (!extracted.value || extracted.value.trim().length === 0) {
        rejectedClaims.push({ message_id: message.id, reason: "empty_value", detail: "empty value", raw: extracted });
        continue;
      }

      const resolution = resolveReferent(extracted.referent, {
        messageText: message.text,
        sourceSpan: extracted.source_span,
      });

      claims.push({
        claim_id: `${message.id}#${ordinal}`,
        message_id: message.id,
        referent: resolution.resolved,
        raw_referent: extracted.referent,
        predicate: "value",
        value: extracted.value,
        raw_value: extracted.value,
        asserter: message.author,
        modality: extracted.modality,
        polarity: extracted.polarity,
        attributed_to: extracted.modality === "reported" ? (extracted.attributed_to ?? null) : null,
        timestamp: message.timestamp,
        source_span: extracted.source_span,
        span_valid: true,
        span_offset: spanResult.offset,
      });
      ordinal++;
    }
  }

  return { claims, rejectedClaims, gatedMessageIds, trace };
}

export interface AdjudicationRunResult {
  buckets: Bucket[];
  verdicts: Verdict[];
  trace: TraceEntry[];
}

/**
 * Resolution -> pre-rules -> adjudication over a caller-supplied claim set.
 * Called with GOLD claims by the eval harness's adjudication run (grader B),
 * and with the extractor's own predicted claims by the live app — same
 * function, so adjudication logic is identical in both places.
 */
export async function runAdjudicationPipeline(
  claims: readonly Claim[],
  messagesById: ReadonlyMap<string, Message>,
  cast: readonly CastEntry[],
  contestedReferents: ReadonlySet<string>,
  asOf: Instant,
  judgeScope: JudgeScope,
  model: ModelClient,
  trustSuppliedReferent = false,
): Promise<AdjudicationRunResult> {
  const trace: TraceEntry[] = [];

  // Re-resolve referents fresh from each claim's raw_referent + message
  // context — necessary for the extractor's own predicted claims, whose
  // raw_referent is a model-emitted phrase that still needs disambiguating
  // into a canonical key (this is also what drives ambiguity-pair
  // detection below). GOLD claims are different: a human already assigned
  // the ground-truth referent, and gold claims don't carry a real
  // source_span (see goldClaimToClaim in eval/run-eval.ts), so re-running
  // resolution against a synthesized whole-message window can incorrectly
  // gate out a claim whose gold referent is correct but whose message text
  // doesn't happen to repeat the referent's required keyword (e.g. C6:
  // "ships with the event" is correctly labelled leaderboard.readiness in
  // gold, but never says "leaderboard", so the window-gated resolver would
  // mint a second, wrong bucket for it). `trustSuppliedReferent` lets the
  // caller assert the input's referent is already ground truth and skip
  // re-resolution entirely for that call.
  const resolvedClaims: Claim[] = trustSuppliedReferent
    ? claims.map((c) => ({ ...c, referent: c.raw_referent || c.referent }))
    : claims.map((c) => {
        const message = messagesById.get(c.message_id);
        if (!message) return c;
        const resolution = resolveReferent(c.raw_referent || c.referent, {
          messageText: message.text,
          sourceSpan: c.source_span,
        });
        return { ...c, referent: resolution.resolved };
      });

  const { buckets, updateBucketKeys } = projectAsOf(resolvedClaims, asOf, cast, contestedReferents);

  const contextByMessageId = new Map<string, ClaimContext>();
  for (const [id, m] of messagesById) contextByMessageId.set(id, { thread_id: m.thread_id, channel: m.channel });
  const ambiguityBuckets = buildAmbiguityBuckets(buckets, asOf, contextByMessageId);
  const allBuckets = [...buckets, ...ambiguityBuckets].sort((a, b) => compareStrings(a.referent, b.referent));

  const verdicts: Verdict[] = [];
  for (const bucket of allBuckets) {
    if (bucket.preRuleVerdict) {
      const verdict: VerdictKind = updateBucketKeys.has(bucket.referent) ? "UPDATE" : bucket.preRuleVerdict;
      verdicts.push({
        bucket_key: bucket.referent,
        asOf,
        judgeScope,
        verdict,
        rationale: bucket.preRuleTrace.find((t) => t.decidesVerdict)?.effect ?? "decided by deterministic pre-rule",
        decidedBy: "pre_rule",
        conflictingClaimIds: [],
        preRuleTrace: bucket.preRuleTrace,
        modelCall: null,
      });
      continue;
    }

    const liveAsserters = new Set(bucket.liveClaims.map((c) => c.asserter));
    if (bucket.liveClaims.length < 2 || liveAsserters.size < 2) {
      // Nothing for the model to adjudicate (shouldn't normally happen once
      // pre-rules have run, but guards against an unexpected shape).
      verdicts.push({
        bucket_key: bucket.referent, asOf, judgeScope, verdict: "COMPATIBLE",
        rationale: "fewer than 2 live claims from distinct asserters", decidedBy: "pre_rule",
        conflictingClaimIds: [], preRuleTrace: bucket.preRuleTrace, modelCall: null,
      });
      continue;
    }

    const inputKey = {
      referent: bucket.referent,
      asOf,
      judgeScope,
      claims: [...bucket.liveClaims]
        .sort((a, b) => compareStrings(a.claim_id, b.claim_id))
        .map((c) => ({
          claim_id: c.claim_id, asserter: c.asserter, value: c.value,
          modality: c.modality, polarity: c.polarity, timestamp: c.timestamp,
        })),
    };
    const user = ADJUDICATION_PROMPT.renderUser({ bucket, judgeScope });

    try {
      const { response, trace: modelTrace } = await model.call({
        tier: "adjudication",
        model: model.config.models.adjudication,
        system: ADJUDICATION_PROMPT.systemFor(judgeScope),
        user,
        temperature: model.config.temperature,
        maxOutputTokens: model.config.maxOutputTokens,
        inputKey,
        step: `adjudicate ${bucket.referent}@${asOf}`,
        judgeScope,
      });
      trace.push(modelTrace);

      const parsed = parseAdjudicationResponse(response.text, judgeScope);
      if (!parsed.ok) {
        verdicts.push({
          bucket_key: bucket.referent, asOf, judgeScope, verdict: "COMPATIBLE",
          rationale: `model output failed schema/parse validation: ${parsed.error}`, decidedBy: "fallback",
          conflictingClaimIds: [], preRuleTrace: bucket.preRuleTrace, modelCall: modelTrace,
        });
        continue;
      }

      const verdict: VerdictKind = bucket.contested ? "CONTESTED" : parsed.verdict;
      verdicts.push({
        bucket_key: bucket.referent, asOf, judgeScope, verdict,
        rationale: parsed.rationale, decidedBy: "model",
        conflictingClaimIds: [...parsed.conflictingClaimIds].sort(),
        preRuleTrace: bucket.preRuleTrace, modelCall: modelTrace,
      });
    } catch (err) {
      if (isHardReplayError(err)) throw err;
      verdicts.push({
        bucket_key: bucket.referent, asOf, judgeScope, verdict: "COMPATIBLE",
        rationale: `model call failed: ${err instanceof Error ? err.message : String(err)}`, decidedBy: "fallback",
        conflictingClaimIds: [], preRuleTrace: bucket.preRuleTrace, modelCall: null,
      });
    }
  }

  verdicts.sort((a, b) => compareStrings(a.bucket_key, b.bucket_key));
  return { buckets: allBuckets, verdicts, trace };
}
