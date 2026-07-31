/**
 * Compares two EvalReports and produces a per-scenario diff. Implements the
 * regression protocol: "a change that improves the average but regresses
 * any single scenario is a failure, not a win" — `anyRegression` is true if
 * even one scenario/metric got worse, regardless of how many improved.
 */

import type { EvalDiff, EvalDiffRow, EvalReport, ScenarioId } from "../types.ts";

const EXTRACTION_METRICS = ["claimRecall", "claimPrecision", "referentAccuracy", "modalityAccuracy", "polarityAccuracy", "spanValidity"] as const;
const ADJUDICATION_METRIC = "verdictAccuracy";

function directionOf(baseline: number, current: number): EvalDiffRow["direction"] {
  if (current > baseline) return "improved";
  if (current < baseline) return "regressed";
  return "unchanged";
}

export function diffReports(baseline: EvalReport, current: EvalReport): EvalDiff {
  const rows: EvalDiffRow[] = [];

  const baselineExtractionById = new Map(baseline.extraction.map((e) => [e.scenario, e]));
  const currentExtractionById = new Map(current.extraction.map((e) => [e.scenario, e]));
  const allScenarioIds = new Set<ScenarioId>([
    ...baselineExtractionById.keys(),
    ...currentExtractionById.keys(),
  ]);

  for (const scenario of allScenarioIds) {
    const b = baselineExtractionById.get(scenario);
    const c = currentExtractionById.get(scenario);
    for (const metric of EXTRACTION_METRICS) {
      const bVal = b?.[metric] ?? null;
      const cVal = c?.[metric] ?? null;
      if (bVal === null || cVal === null) continue;
      rows.push({
        scenario,
        metric,
        baseline: bVal,
        current: cVal,
        delta: Number((cVal - bVal).toFixed(4)),
        direction: directionOf(bVal, cVal),
      });
    }
  }

  const baselineAdjById = new Map(baseline.adjudication.map((a) => [a.scenario, a]));
  const currentAdjById = new Map(current.adjudication.map((a) => [a.scenario, a]));
  const allAdjIds = new Set<ScenarioId>([...baselineAdjById.keys(), ...currentAdjById.keys()]);
  for (const scenario of allAdjIds) {
    const b = baselineAdjById.get(scenario);
    const c = currentAdjById.get(scenario);
    if (!b || !c) continue;
    rows.push({
      scenario,
      metric: ADJUDICATION_METRIC,
      baseline: b.verdictAccuracy,
      current: c.verdictAccuracy,
      delta: Number((c.verdictAccuracy - b.verdictAccuracy).toFixed(4)),
      direction: directionOf(b.verdictAccuracy, c.verdictAccuracy),
    });
  }

  rows.sort((a, b) => (a.scenario < b.scenario ? -1 : a.scenario > b.scenario ? 1 : a.metric < b.metric ? -1 : 1));

  const anyRegression = rows.some((r) => r.direction === "regressed");
  const improved = rows.filter((r) => r.direction === "improved").length;
  const regressed = rows.filter((r) => r.direction === "regressed").length;
  const unchanged = rows.filter((r) => r.direction === "unchanged").length;

  return {
    baselineGeneratedAt: baseline.generatedAt,
    rows,
    anyRegression,
    summary: `${regressed} regression${regressed === 1 ? "" : "s"}, ${improved} improvement${improved === 1 ? "" : "s"}, ${unchanged} unchanged`,
  };
}
