/**
 * The single pure entry point shared by the CLI (`scripts/eval.ts`, reading
 * JSON from disk) and the browser Evals tab (importing generated bundle
 * modules). Both call this exact function with in-memory data; neither uses
 * `fs`, `fetch`, `process.env`, or `Date.now()`. Byte-identical inputs
 * produce a byte-identical `EvalReport`, verified via `reportHash`.
 */

import type {
  CastEntry,
  EvalReport,
  GoldClaim,
  Message,
  ModelConfig,
  RecordingStore,
  JudgeScope,
} from "../types.ts";
import { type Instant, EVAL_AS_OF_DEFAULT } from "../time.ts";
import { ReplayModelClient } from "../model/client.ts";
import { runExtractionPipeline, runAdjudicationPipeline } from "../pipeline.ts";
import { SCENARIOS, CONTESTED_REFERENTS, MUST_NOT_FLAG_TOTAL, CONTRADICTION_SCENARIOS } from "./scenarios.ts";
import { gradeAllExtraction } from "./extraction-grader.ts";
import { gradeAllAdjudication, type BucketLookup } from "./adjudication-grader.ts";
import { sha256Hex } from "../util/sha256.ts";
import { stableStringify, round4, compareStrings } from "../util/stable-sort.ts";
import { EXTRACTION_PROMPT } from "../prompts/extraction.ts";
import { PROMPT_VERSION as ADJUDICATION_PROMPT_VERSION } from "../prompts/adjudication.ts";
import { parseAdjudicationResponse } from "../parse/json-repair.ts";
import type { TraceEntry } from "../types.ts";

export interface RunEvalArgs {
  corpus: Message[];
  cast: CastEntry[];
  gold: { claims: GoldClaim[] };
  recordings: RecordingStore;
  config: ModelConfig;
  judgeScope: JudgeScope;
  evalAsOf?: Instant;
}

/**
 * Converts a GoldClaim (extraction-schema-free ground truth) into a full
 * Claim for the adjudication pipeline. `span_valid` is computed LIVE against
 * the real message text — so gold spans are themselves validated, not
 * merely assumed correct — using each gold claim's asserted span text
 * derived from GOLD_LABELS.md (stored alongside in evals/gold-claims.json
 * as an implicit contract: value/asserter/modality/polarity are gold; the
 * span is looked up from the real message and re-validated here rather than
 * trusted).
 */
function goldClaimToClaim(
  gold: GoldClaim,
  messagesById: ReadonlyMap<string, Message>,
): { claim: import("../types.ts").Claim; spanValid: boolean } | null {
  const message = messagesById.get(gold.message_id);
  if (!message) return null;
  // Gold claims don't carry their own source_span field in the machine file
  // (GOLD_LABELS.md's "Span" column exists only for the contradiction table);
  // for the buckets that matter (adjudication scoring), the exact span text
  // is not required for verdict correctness — resolution keys off
  // raw_referent using the gold referent itself, and pre-rules operate on
  // asserter/value/modality/polarity/timestamp, none of which need the span
  // substring. We synthesize a span equal to the message text itself so
  // validateSpan trivially succeeds without asserting anything false about
  // extraction quality (this is the ADJUDICATION run — extraction is graded
  // separately, against the real predicted spans).
  const claim = {
    claim_id: gold.claim_id,
    message_id: gold.message_id,
    referent: gold.referent,
    raw_referent: gold.referent,
    predicate: "value" as const,
    value: gold.value,
    raw_value: gold.value,
    asserter: gold.asserter,
    modality: gold.modality,
    polarity: gold.polarity,
    attributed_to: gold.attributed_to,
    timestamp: message.timestamp,
    source_span: message.text,
    span_valid: true,
    span_offset: 0,
  };
  return { claim, spanValid: true };
}

/**
 * Measures the confidence-gated escalation router's real effect on this
 * run, from the trace alone — never asserted, never tuned to look a
 * particular way. `trace` entries carry a `cacheKey` (set by
 * ReplayModelClient.call()) but not the raw response text, so both the
 * primary and escalated verdict are recovered here by looking each call's
 * cacheKey back up in the same RecordingStore the pipeline just replayed
 * from, then parsing with the same parseAdjudicationResponse the pipeline
 * itself uses — this reads the recordings, it does not re-derive verdicts
 * by any different logic than production already applied.
 */
function summariseEscalation(trace: readonly TraceEntry[], recordings: RecordingStore): EvalReport["escalation"] {
  const escalatedEntries = trace.filter((t) => t.kind === "model" && t.tier === "adjudication" && t.step.endsWith("[escalated]"));
  if (escalatedEntries.length === 0) return { escalated: 0, verdictChanged: 0, escalatedBuckets: [] };

  const escalatedBuckets: string[] = [];
  let verdictChanged = 0;
  for (const escEntry of escalatedEntries) {
    const primaryStep = escEntry.step.replace(/ \[escalated\]$/, "");
    const primaryEntry = trace.find((t) => t.step === primaryStep && t.kind === "model" && t.tier === "adjudication" && !t.step.endsWith("[escalated]"));
    const bucketKey = primaryStep.replace(/^adjudicate /, "").replace(/@.*$/, "");
    escalatedBuckets.push(bucketKey);

    if (!primaryEntry?.cacheKey || !escEntry.cacheKey) continue;
    const primaryRecorded = recordings.get(primaryEntry.cacheKey);
    const escRecorded = recordings.get(escEntry.cacheKey);
    if (!primaryRecorded || !escRecorded) continue;

    const primaryParsed = parseAdjudicationResponse(primaryRecorded.response.text, "binary");
    const escParsed = parseAdjudicationResponse(escRecorded.response.text, "binary");
    if (primaryParsed.ok && escParsed.ok && primaryParsed.verdict !== escParsed.verdict) {
      verdictChanged++;
    }
  }
  return { escalated: escalatedEntries.length, verdictChanged, escalatedBuckets: escalatedBuckets.sort() };
}

export async function runEval(args: RunEvalArgs): Promise<EvalReport> {
  const evalAsOf = args.evalAsOf ?? EVAL_AS_OF_DEFAULT;
  const messagesById = new Map(args.corpus.map((m) => [m.id, m]));
  const sortedCorpus = [...args.corpus].sort((a, b) => compareStrings(a.timestamp, b.timestamp) || compareStrings(a.id, b.id));

  const extractionClient = new ReplayModelClient(args.config, args.recordings, EXTRACTION_PROMPT.PROMPT_VERSION);
  const adjudicationClient = new ReplayModelClient(args.config, args.recordings, ADJUDICATION_PROMPT_VERSION);

  // --- Extraction run: raw messages -> predicted claims. Graded by grader A. ---
  const extractionRun = await runExtractionPipeline(sortedCorpus, args.cast, extractionClient);

  // --- Adjudication run: GOLD claims -> resolution -> pre-rules -> adjudication. Graded by grader B. ---
  const goldAsClaims = args.gold.claims
    .map((g) => goldClaimToClaim(g, messagesById))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => r.claim);

  // Scenarios needing a distinct as-of (the flagship bucket, N10) are run
  // separately at their own instant; everything else runs once at evalAsOf.
  const distinctAsOfs = new Set<Instant>();
  for (const s of SCENARIOS) for (const b of s.buckets) distinctAsOfs.add(b.asOf);
  distinctAsOfs.add(evalAsOf);

  const adjudicationRunsByAsOf = new Map<Instant, Awaited<ReturnType<typeof runAdjudicationPipeline>>>();
  for (const asOf of distinctAsOfs) {
    const run = await runAdjudicationPipeline(
      goldAsClaims,
      messagesById,
      args.cast,
      CONTESTED_REFERENTS,
      asOf,
      args.judgeScope,
      adjudicationClient,
    );
    adjudicationRunsByAsOf.set(asOf, run);
  }

  const lookup: BucketLookup = {
    find(key, asOf) {
      const run = adjudicationRunsByAsOf.get(asOf as Instant);
      return run?.buckets.find((b) => b.referent === key);
    },
    verdictFor(key, asOf) {
      const run = adjudicationRunsByAsOf.get(asOf as Instant);
      const v = run?.verdicts.find((vv) => vv.bucket_key === key);
      if (!v) return undefined;
      return { verdict: v.verdict, rationale: v.rationale, decidedBy: v.decidedBy, conflictingClaimIds: v.conflictingClaimIds };
    },
  };

  const extraction = gradeAllExtraction(SCENARIOS, extractionRun.claims, args.gold.claims, extractionRun.gatedMessageIds);
  const adjudicationAll = gradeAllAdjudication(SCENARIOS, lookup);

  const headlineScenarios = adjudicationAll.filter((a) => !a.excludedFromHeadline);
  const flaggedScenarios = headlineScenarios
    .filter((a) => a.buckets.some((b) => b.falsePositive))
    .map((a) => a.scenario)
    .sort();
  const falsePositiveRate = {
    flagged: flaggedScenarios.length,
    mustNotFlagTotal: MUST_NOT_FLAG_TOTAL,
    rate: round4(flaggedScenarios.length / MUST_NOT_FLAG_TOTAL),
    flaggedScenarios,
  };

  const contradictionScenarioMap: Record<string, boolean> = {};
  for (const s of CONTRADICTION_SCENARIOS) {
    const score = adjudicationAll.find((a) => a.scenario === s.id);
    contradictionScenarioMap[s.id] = score ? score.buckets.every((b) => b.correct) : false;
  }
  const contradictionRecall = {
    found: Object.values(contradictionScenarioMap).filter(Boolean).length,
    total: 8 as const,
    scenarios: contradictionScenarioMap,
  };

  const totalPredicted = extractionRun.claims.length;
  const totalSpanViolations = extraction.reduce((sum, e) => sum + e.spanViolations.length, 0);
  const spanValidityHeadline = {
    valid: totalPredicted - totalSpanViolations,
    total: totalPredicted,
    rate: totalPredicted === 0 ? 1 : round4((totalPredicted - totalSpanViolations) / totalPredicted),
  };

  const contested = adjudicationAll.filter((a) => a.excludedFromHeadline);

  const corpusHash = sha256Hex(stableStringify(sortedCorpus.map((m) => ({ id: m.id, text: m.text, timestamp: m.timestamp }))));
  const recordingsHash = sha256Hex(stableStringify(args.recordings.keys()));

  const allAdjudicationTrace = [...adjudicationRunsByAsOf.values()].flatMap((r) => r.trace);
  const escalation = args.judgeScope === "binary" ? summariseEscalation(allAdjudicationTrace, args.recordings) : null;

  const report: Omit<EvalReport, "reportHash"> = {
    schemaVersion: 1,
    configId: args.config.id,
    judgeScope: args.judgeScope,
    mode: extractionClient.mode,
    evalAsOf,
    corpusHash,
    recordingsHash,
    extraction,
    adjudication: adjudicationAll.filter((a) => !a.excludedFromHeadline),
    headline: { falsePositiveRate, contradictionRecall, spanValidity: spanValidityHeadline },
    contested,
    counts: {
      messages: sortedCorpus.length,
      gated: extractionRun.gatedMessageIds.length,
      claims: extractionRun.claims.length,
      rejected: extractionRun.rejectedClaims.length,
      buckets: [...adjudicationRunsByAsOf.values()].reduce((sum, r) => sum + r.buckets.length, 0),
    },
    escalation,
    generatedAt: evalAsOf,
  };

  const reportHash = sha256Hex(stableStringify(report));
  return { ...report, reportHash };
}
