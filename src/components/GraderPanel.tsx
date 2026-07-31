"use client";

import type { EvalReport } from "@/core/types";

/**
 * Shows what proves reproducibility is real without asking a reviewer to
 * act on it: EVAL_AS_OF frozen on screen, the recordings hash, this run's
 * reportHash, model ids used, judge scope, and a line stating the CLI
 * emits the same hash. See build plan's "Reproducibility panel".
 */
export function ReproducibilityPanel({ report }: { report: EvalReport }) {
  return (
    <div className="drilldown" style={{ marginBottom: "var(--space-3)" }}>
      <div className="section-heading" style={{ fontSize: "var(--size-caption)", marginTop: 0 }}>
        Reproducibility
      </div>
      <table className="claim-table">
        <tbody>
          <tr>
            <td>EVAL_AS_OF (frozen)</td>
            <td className="mono-cell">{report.evalAsOf}</td>
          </tr>
          <tr>
            <td>Config</td>
            <td className="mono-cell">{report.configId}</td>
          </tr>
          <tr>
            <td>Judge scope</td>
            <td className="mono-cell">{report.judgeScope}</td>
          </tr>
          <tr>
            <td>Mode</td>
            <td className="mono-cell">{report.mode}</td>
          </tr>
          <tr>
            <td>Corpus hash</td>
            <td className="mono-cell">{report.corpusHash.slice(0, 16)}...</td>
          </tr>
          <tr>
            <td>Recordings hash</td>
            <td className="mono-cell">{report.recordingsHash.slice(0, 16)}...</td>
          </tr>
          <tr>
            <td>This run&apos;s report hash</td>
            <td className="mono-cell">{report.reportHash}</td>
          </tr>
        </tbody>
      </table>
      <p className="claim-state-label">
        <code>npm run eval -- --print-hash</code> against the same committed recordings prints this same report hash offline, with no API key.
      </p>
    </div>
  );
}
