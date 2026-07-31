/**
 * Grader B: scores adjudication only, fed GOLD claims (never the pipeline's
 * predicted claims) so a bad extractor can neither mask nor manufacture
 * adjudication errors. See GOLD_LABELS.md §3 and the build plan's "two
 * graders, never merged" — this is the headline grader.
 */

import type { AdjudicationScore, Bucket, ScenarioId, VerdictKind } from "../types.ts";
import type { ScenarioDef, ScenarioBucketExpectation } from "./scenarios.ts";
import { round4 } from "../util/stable-sort.ts";

export interface BucketLookup {
  /** Finds the bucket (or ambiguity bucket) matching `key` at `asOf`, if the pipeline produced one. */
  find(key: string, asOf: string): Bucket | undefined;
  /** The verdict the pipeline actually assigned to that bucket (pre-rule or model). */
  verdictFor(key: string, asOf: string): { verdict: VerdictKind; rationale: string; decidedBy: "pre_rule" | "model" | "fallback"; conflictingClaimIds: string[] } | undefined;
}

function gradeOneBucket(
  expectation: ScenarioBucketExpectation,
  lookup: BucketLookup,
): AdjudicationScore["buckets"][number] {
  const actualVerdict = lookup.verdictFor(expectation.key, expectation.asOf);
  const actual = actualVerdict?.verdict ?? ("COMPATIBLE" as VerdictKind); // absent bucket = nothing flagged
  const correct = actual === expectation.expected;

  let falsePositive = false;
  if (expectation.expected !== "CONTRADICTION" && expectation.expected !== "CONTESTED") {
    falsePositive = actual === "CONTRADICTION";
  }
  if (expectation.mustNotAppearInConflict && actualVerdict) {
    if (
      actualVerdict.verdict === "CONTRADICTION" &&
      actualVerdict.conflictingClaimIds.includes(expectation.mustNotAppearInConflict)
    ) {
      falsePositive = true;
    }
  }

  return {
    bucket_key: expectation.key,
    asOf: expectation.asOf,
    expected: expectation.expected,
    actual,
    correct,
    falsePositive,
    decidedBy: actualVerdict?.decidedBy ?? "pre_rule",
    rationale: actualVerdict?.rationale ?? "(no bucket produced by pipeline at this as-of; treated as no contradiction)",
  };
}

export function gradeAdjudication(scenario: ScenarioDef, lookup: BucketLookup): AdjudicationScore {
  const buckets = scenario.buckets.map((b) => gradeOneBucket(b, lookup));
  const verdictAccuracy = buckets.length === 0 ? 1 : round4(buckets.filter((b) => b.correct).length / buckets.length);

  return {
    scenario: scenario.id,
    buckets,
    verdictAccuracy,
    isMustNotFlag: scenario.kind === "must_not_flag",
    excludedFromHeadline: !scenario.scoredInHeadline,
  };
}

export function gradeAllAdjudication(scenarios: readonly ScenarioDef[], lookup: BucketLookup): AdjudicationScore[] {
  return scenarios
    .map((scenario) => gradeAdjudication(scenario, lookup))
    .sort((a, b) => (a.scenario < b.scenario ? -1 : a.scenario > b.scenario ? 1 : 0));
}

export type { ScenarioId };
