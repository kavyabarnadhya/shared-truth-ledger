"use client";

import type { AdjudicationScore, ExtractionScore } from "@/core/types";
import { SCENARIOS_BY_ID } from "@/core/eval/scenarios";

/**
 * The Evals tab is a plain data table (design brief) — no big-number tiles,
 * no charts, no progress rings. Per-scenario rows, never averaged into a
 * single score.
 *
 * Part D: every table looks the scenario id up in SCENARIOS_BY_ID (already
 * imported by the eval harness itself, read-only here — no scoring logic
 * touched) to render its real title and notes instead of a bare "C4"/"N10",
 * and offers a "View the messages" action wired to SourcePanel via
 * onViewMessages(messageIds) so a reviewer can see the actual source text a
 * scenario is scored against.
 */
function ScenarioLabel({ scenario, onViewMessages }: { scenario: string; onViewMessages?: (messageIds: string[]) => void }) {
  const def = SCENARIOS_BY_ID.get(scenario as never);
  return (
    <div>
      <div>
        <span className="mono-cell">{scenario}</span>
        {def && <strong style={{ marginLeft: "0.5em" }}>{def.title}</strong>}
      </div>
      {def && (
        <div className="claim-state-label" style={{ marginTop: "0.2em", maxWidth: "32em" }}>
          {def.notes}
        </div>
      )}
      {def && def.messageIds.length > 0 && onViewMessages && (
        <button
          className="claim-side__source-link"
          style={{ marginTop: "0.3em" }}
          onClick={() => onViewMessages(def.messageIds)}
        >
          View the messages →
        </button>
      )}
    </div>
  );
}

export function AdjudicationTable({
  scores,
  onViewMessages,
}: {
  scores: AdjudicationScore[];
  onViewMessages?: (messageIds: string[]) => void;
}) {
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
              <td>{i === 0 ? <ScenarioLabel scenario={s.scenario} onViewMessages={onViewMessages} /> : <span className="mono-cell">{s.scenario}</span>}</td>
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

export function ExtractionTable({
  scores,
  onViewMessages,
}: {
  scores: ExtractionScore[];
  onViewMessages?: (messageIds: string[]) => void;
}) {
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
          <th>Span violations</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((s) => (
          <tr key={s.scenario}>
            <td><ScenarioLabel scenario={s.scenario} onViewMessages={onViewMessages} /></td>
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
