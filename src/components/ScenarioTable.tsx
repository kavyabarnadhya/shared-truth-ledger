"use client";

import type { AdjudicationScore, ExtractionScore } from "@/core/types";

/**
 * The Evals tab is a plain data table (design brief) — no big-number tiles,
 * no charts, no progress rings. Per-scenario rows, never averaged into a
 * single score.
 */
export function AdjudicationTable({ scores }: { scores: AdjudicationScore[] }) {
  return (
    <table className="eval-table">
      <thead>
        <tr>
          <th>Scenario</th>
          <th>Bucket</th>
          <th>As-of</th>
          <th>Expected</th>
          <th>Actual</th>
          <th>Result</th>
          <th>Decided by</th>
        </tr>
      </thead>
      <tbody>
        {scores.flatMap((s) =>
          s.buckets.map((b, i) => (
            <tr key={`${s.scenario}-${i}`}>
              <td className="mono-cell">{s.scenario}</td>
              <td className="mono-cell">{b.bucket_key}</td>
              <td className="mono-cell">{b.asOf}</td>
              <td className="mono-cell">{b.expected}</td>
              <td className="mono-cell">{b.actual}</td>
              <td>
                {b.correct ? "correct" : "MISMATCH"}
                {b.falsePositive ? " — FALSE POSITIVE" : ""}
              </td>
              <td>{b.decidedBy}</td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}

export function ExtractionTable({ scores }: { scores: ExtractionScore[] }) {
  return (
    <table className="eval-table">
      <thead>
        <tr>
          <th>Scenario</th>
          <th className="num">Recall</th>
          <th className="num">Precision</th>
          <th className="num">Referent</th>
          <th className="num">Modality</th>
          <th className="num">Polarity</th>
          <th className="num">Span validity</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((s) => (
          <tr key={s.scenario}>
            <td className="mono-cell">{s.scenario}</td>
            <td className="num">{s.claimRecall}</td>
            <td className="num">{s.claimPrecision}</td>
            <td className="num">{s.referentAccuracy}</td>
            <td className="num">{s.modalityAccuracy}</td>
            <td className="num">{s.polarityAccuracy}</td>
            <td className="num">{s.spanValidity}</td>
            <td>{s.spanViolations.length > 0 ? `SPAN VIOLATIONS: ${s.spanViolations.join(", ")}` : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
