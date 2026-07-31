/**
 * Grader A: scores extraction only — claims and spans, never verdicts. Fed
 * the pipeline's PREDICTED claims (from real messages through the real
 * extractor). Never sees adjudication output, so a lucky verdict can't hide
 * a bad extraction and vice versa. See GOLD_LABELS.md §2 and the build
 * plan's "two graders, never merged".
 */

import type { Claim, GoldClaim, ExtractionScore, ScenarioId } from "../types.ts";
import { freeTextSimilarity, normaliseDateValue, parseNumberWithUnit } from "../normalise.ts";
import type { ScenarioDef } from "./scenarios.ts";
import { round4 } from "../util/stable-sort.ts";

const FREE_TEXT_MATCH_THRESHOLD = 0.6;

/**
 * Value equivalence: dates compare as ISO dates once normalised; numbers
 * with units compare numerically; everything else falls back to the
 * documented token-set Jaccard threshold for free text. This mirrors
 * referent.ts's own value-normalisation primitives so grading and
 * resolution agree on what "the same value" means.
 */
export function valuesEquivalent(predicted: string, gold: string): boolean {
  if (predicted.trim() === gold.trim()) return true;

  const predDate = normaliseDateValue(predicted, 2026);
  const goldDate = normaliseDateValue(gold, 2026);
  if (predDate && goldDate) return predDate === goldDate;

  const predNum = parseNumberWithUnit(predicted);
  const goldNum = parseNumberWithUnit(gold);
  if (predNum && goldNum) return predNum.n === goldNum.n && predNum.unit === goldNum.unit;

  return freeTextSimilarity(predicted, gold) >= FREE_TEXT_MATCH_THRESHOLD;
}

interface MatchCandidate {
  goldClaimId: string;
  predClaimId: string;
  similarity: number;
}

/**
 * Greedy one-to-one matching by descending value similarity, tie-broken on
 * claim_id ascending — deterministic regardless of input array order.
 */
function matchClaims(
  predicted: readonly Claim[],
  gold: readonly GoldClaim[],
): { matches: Array<{ pred: Claim; gold: GoldClaim }>; unmatchedPred: Claim[]; unmatchedGold: GoldClaim[] } {
  const candidates: MatchCandidate[] = [];
  for (const p of predicted) {
    for (const g of gold) {
      if (p.message_id !== g.message_id) continue;
      if (!valuesEquivalent(p.value, g.value)) continue;
      candidates.push({
        goldClaimId: g.claim_id,
        predClaimId: p.claim_id,
        similarity: p.value.trim() === g.value.trim() ? 1 : freeTextSimilarity(p.value, g.value),
      });
    }
  }
  candidates.sort((a, b) => b.similarity - a.similarity || (a.goldClaimId < b.goldClaimId ? -1 : 1) || (a.predClaimId < b.predClaimId ? -1 : 1));

  const usedGold = new Set<string>();
  const usedPred = new Set<string>();
  const matches: Array<{ pred: Claim; gold: GoldClaim }> = [];
  const predById = new Map(predicted.map((p) => [p.claim_id, p]));
  const goldById = new Map(gold.map((g) => [g.claim_id, g]));

  for (const c of candidates) {
    if (usedGold.has(c.goldClaimId) || usedPred.has(c.predClaimId)) continue;
    usedGold.add(c.goldClaimId);
    usedPred.add(c.predClaimId);
    matches.push({ pred: predById.get(c.predClaimId)!, gold: goldById.get(c.goldClaimId)! });
  }

  const unmatchedPred = predicted.filter((p) => !usedPred.has(p.claim_id));
  const unmatchedGold = gold.filter((g) => !usedGold.has(g.claim_id));
  return { matches, unmatchedPred, unmatchedGold };
}

export interface ExtractionGraderInput {
  scenario: ScenarioDef;
  /** Predicted claims restricted to this scenario's messageIds. */
  predictedClaims: readonly Claim[];
  goldClaims: readonly GoldClaim[];
  gatedMessageIds: readonly string[];
}

export function gradeExtraction(input: ExtractionGraderInput): ExtractionScore {
  const { scenario, predictedClaims, goldClaims, gatedMessageIds } = input;
  const scenarioGold = goldClaims.filter((g) => scenario.goldClaimIds.includes(g.claim_id));
  const scenarioPred = predictedClaims.filter((p) => scenario.messageIds.includes(p.message_id));

  const { matches, unmatchedPred, unmatchedGold } = matchClaims(scenarioPred, scenarioGold);

  const claimsExpected = scenarioGold.length;
  const claimsFound = matches.length;
  const claimsSpurious = unmatchedPred.length;

  const claimRecall = claimsExpected === 0 ? (claimsSpurious === 0 ? 1 : 0) : round4(claimsFound / claimsExpected);
  const claimPrecision =
    scenarioPred.length === 0 ? (claimsExpected === 0 ? 1 : 0) : round4(claimsFound / scenarioPred.length);

  const referentMatches = matches.filter((m) => m.pred.referent === m.gold.referent).length;
  const modalityMatches = matches.filter((m) => m.pred.modality === m.gold.modality).length;
  const polarityMatches = matches.filter((m) => m.pred.polarity === m.gold.polarity).length;

  const referentAccuracy = matches.length === 0 ? 1 : round4(referentMatches / matches.length);
  const modalityAccuracy = matches.length === 0 ? 1 : round4(modalityMatches / matches.length);
  const polarityAccuracy = matches.length === 0 ? 1 : round4(polarityMatches / matches.length);

  const spanViolations = scenarioPred.filter((p) => !p.span_valid).map((p) => p.message_id);
  const spanValidity =
    scenarioPred.length === 0 ? 1 : round4((scenarioPred.length - spanViolations.length) / scenarioPred.length);

  let gatedCorrectly: boolean | null = null;
  if (scenario.expectGated) {
    gatedCorrectly = scenario.expectGated.every((id) => gatedMessageIds.includes(id));
  }

  const perClaim: ExtractionScore["perClaim"] = [
    ...matches.map((m) => ({
      goldClaimId: m.gold.claim_id,
      predClaimId: m.pred.claim_id,
      matched: true,
      referentOk: m.pred.referent === m.gold.referent,
      modalityOk: m.pred.modality === m.gold.modality,
      polarityOk: m.pred.polarity === m.gold.polarity,
      spanOk: m.pred.span_valid,
      note: "matched",
    })),
    ...unmatchedGold.map((g) => ({
      goldClaimId: g.claim_id,
      predClaimId: null,
      matched: false,
      referentOk: null,
      modalityOk: null,
      polarityOk: null,
      spanOk: null,
      note: "gold claim not found in predictions",
    })),
    ...unmatchedPred.map((p) => ({
      goldClaimId: null,
      predClaimId: p.claim_id,
      matched: false,
      referentOk: null,
      modalityOk: null,
      polarityOk: null,
      spanOk: p.span_valid,
      note: "spurious: no matching gold claim",
    })),
  ];

  return {
    scenario: scenario.id,
    goldClaimIds: scenario.goldClaimIds,
    claimsExpected,
    claimsFound,
    claimsSpurious,
    claimRecall,
    claimPrecision,
    referentAccuracy,
    modalityAccuracy,
    polarityAccuracy,
    spanValidity,
    spanViolations,
    gatedCorrectly,
    perClaim,
  };
}

export function gradeAllExtraction(
  scenarios: readonly ScenarioDef[],
  predictedClaims: readonly Claim[],
  goldClaims: readonly GoldClaim[],
  gatedMessageIds: readonly string[],
): ExtractionScore[] {
  return scenarios
    .map((scenario) => gradeExtraction({ scenario, predictedClaims, goldClaims, gatedMessageIds }))
    .sort((a, b) => (a.scenario < b.scenario ? -1 : a.scenario > b.scenario ? 1 : 0));
}

export type { ScenarioId };
