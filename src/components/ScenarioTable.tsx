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
 *
 * Restructure (density pass): the id + title used to sit above the notes
 * paragraph and the "View the messages" link, all stacked inline inside the
 * row's first cell — a real <table> in markup, but every row several lines
 * tall, so ~27 of them read as a stacked-paragraph wall, not a scannable
 * list. The id/title now render on a single line; the notes text and the
 * "View the messages" action (same content, not shortened) move into a
 * <details> the reader opens per scenario — the same disclosure pattern
 * already used for the gold-claims sample and prompt viewers elsewhere on
 * this page, not a new interaction.
 */
function ScenarioLabel({ scenario, onViewMessages }: { scenario: string; onViewMessages?: (messageIds: string[]) => void }) {
  const def = SCENARIOS_BY_ID.get(scenario as never);
  return (
    <div>
      <div className="scenario-label__line">
        <span className="mono-cell">{scenario}</span>
        {def && <strong>{def.title}</strong>}
      </div>
      {def && (def.notes || (def.messageIds.length > 0 && onViewMessages)) && (
        <details className="drilldown drilldown--compact">
          <summary>detail</summary>
          <div style={{ marginTop: "var(--space-1)" }}>
            {def.notes && <p className="claim-state-label" style={{ margin: 0 }}>{def.notes}</p>}
            {def.messageIds.length > 0 && onViewMessages && (
              <button
                className="claim-side__source-link"
                style={{ marginTop: "0.3em" }}
                onClick={() => onViewMessages(def.messageIds)}
              >
                View the messages →
              </button>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

export function AdjudicationTable({
  scores,
  onViewMessages,
  idPrefix = "",
}: {
  scores: AdjudicationScore[];
  onViewMessages?: (messageIds: string[]) => void;
  /**
   * Distinguishes row anchor ids when more than one AdjudicationTable is on
   * the same page (headline + contested) — without this, two tables could
   * in principle emit the same `id="scenario-X"` if a scenario id were ever
   * reused across both, silently breaking `#scenario-X` deep links (the
   * browser jumps to whichever renders first). Leave unset for the primary/
   * headline table so its existing `#scenario-C4`-style links keep working.
   */
  idPrefix?: string;
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
            <tr key={`${s.scenario}-${i}`} id={i === 0 ? `scenario-${idPrefix}${s.scenario}` : undefined}>
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
