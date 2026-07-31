"use client";

import type { EvalDiff } from "@/core/types";

/**
 * Per-scenario diff against the committed baseline. Implements the stated
 * protocol: an average that improves while a single scenario regresses is a
 * failure, not a win — so `anyRegression` gets a prominent banner regardless
 * of how many scenarios improved alongside it.
 */
export function DiffPanel({ diff }: { diff: EvalDiff }) {
  return (
    <div>
      {diff.anyRegression && (
        <div className="banner banner--warn">
          REGRESSION — {diff.summary}. Baseline from {diff.baselineGeneratedAt}.
        </div>
      )}
      {!diff.anyRegression && <div className="banner">{diff.summary}. No regressions.</div>}

      <table className="eval-table">
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Metric</th>
            <th className="num">Baseline</th>
            <th className="num">Current</th>
            <th className="num">Delta</th>
            <th>Direction</th>
          </tr>
        </thead>
        <tbody>
          {diff.rows
            .filter((r) => r.direction !== "unchanged")
            .map((r, i) => (
              <tr key={i}>
                <td className="mono-cell">{r.scenario}</td>
                <td>{r.metric}</td>
                <td className="num">{r.baseline}</td>
                <td className="num">{r.current}</td>
                <td className="num">{r.delta}</td>
                <td>{r.direction === "regressed" ? "REGRESSED" : "improved"}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {diff.rows.every((r) => r.direction === "unchanged") && (
        <p className="claim-state-label">All scenarios unchanged from baseline.</p>
      )}
    </div>
  );
}
