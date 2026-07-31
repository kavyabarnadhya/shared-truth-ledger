"use client";

import { useState } from "react";
import { AdjudicationTable, ExtractionTable } from "@/components/ScenarioTable";
import { ReproducibilityPanel } from "@/components/GraderPanel";
import { DiffPanel } from "@/components/DiffPanel";
import type { EvalReport, EvalDiff, GoldClaim, JudgeScope } from "@/core/types";

interface GoldClaimsFile {
  claims: GoldClaim[];
}

/**
 * Runs the eval suite in the browser on demand against the committed
 * recordings — no API key, a few seconds. This is where the reproducibility
 * claim is proven, not just asserted: a reviewer who only ever opens the
 * hosted link can watch it execute.
 */
export default function EvalsPage() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [compareReport, setCompareReport] = useState<EvalReport | null>(null);
  const [diff, setDiff] = useState<EvalDiff | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [judgeScope, setJudgeScope] = useState<JudgeScope>("binary");

  async function loadModules() {
    const [{ runEval }, { RECORDINGS }, { MESSAGES, CAST }, { getConfig }, { InMemoryRecordingStore }, goldClaimsModule] =
      await Promise.all([
        import("@/core/eval/run-eval"),
        import("../../../fixtures/recorded.generated"),
        import("@/corpus/bundled.generated"),
        import("@/core/model/config"),
        import("@/core/model/client"),
        import("../../../evals/gold-claims.json") as Promise<{ default: GoldClaimsFile }>,
      ]);
    const recordings = new InMemoryRecordingStore(Object.values(RECORDINGS));
    return { runEval, recordings, MESSAGES, CAST, getConfig, goldClaims: goldClaimsModule.default.claims };
  }

  async function runSuite() {
    setRunning(true);
    setError(null);
    try {
      // Dynamic import inside the handler, per the build plan, so the
      // recordings/corpus bundles are not part of any other tab's bundle.
      const { runEval, recordings, MESSAGES, CAST, getConfig, goldClaims } = await loadModules();
      const result = await runEval({
        corpus: MESSAGES,
        cast: CAST,
        gold: { claims: goldClaims },
        recordings,
        config: getConfig("free"),
        judgeScope,
      });
      setReport(result);

      try {
        // Cast through `unknown` first: evals/baseline.json's inferred
        // literal shape has plain `string` fields (e.g. evalAsOf), which
        // structurally clashes with EvalReport's nominally branded `Instant`
        // — same reason scripts/generate-bundles.ts casts its generated
        // modules the same way. The runtime "schemaVersion" check below is
        // what actually distinguishes a real baseline from the placeholder,
        // not this cast.
        const baselineModule = (await import("../../../evals/baseline.json")) as unknown as {
          default: EvalReport | { _placeholder: true };
        };
        const baseline = baselineModule.default;
        // A real baseline always carries schemaVersion (see EvalReport); the
        // placeholder committed before `npm run freeze:baseline` has been run
        // does not, so this is the explicit "no real baseline yet" signal
        // rather than relying solely on diffReports throwing on bad shape.
        if ("schemaVersion" in baseline) {
          const { diffReports } = await import("@/core/eval/diff");
          setDiff(diffReports(baseline, result));
        } else {
          setDiff(null);
        }
      } catch {
        // No baseline committed yet (npm run freeze:baseline hasn't been run) — the diff panel simply doesn't render.
        setDiff(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function runComparison() {
    setRunning(true);
    setError(null);
    try {
      const { runEval, recordings, MESSAGES, CAST, getConfig, goldClaims } = await loadModules();
      const config = getConfig("free");
      const binaryResult = await runEval({ corpus: MESSAGES, cast: CAST, gold: { claims: goldClaims }, recordings, config, judgeScope: "binary" });
      const full7Result = await runEval({ corpus: MESSAGES, cast: CAST, gold: { claims: goldClaims }, recordings, config, judgeScope: "full7" });
      setReport(binaryResult);
      setCompareReport(full7Result);
      const { diffReports } = await import("@/core/eval/diff");
      setDiff(diffReports(binaryResult, full7Result));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const headline = report?.headline;

  return (
    <main className="page">
      <h1 className="page-title">Evals</h1>
      <p className="page-subtitle">
        Runs the eval suite in your browser, against the recordings committed to this repo. No API key, no network call.
      </p>

      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={runSuite} disabled={running}>
          {running ? "Running..." : "Run evals"}
        </button>
        <button onClick={runComparison} disabled={running}>
          {running ? "Running..." : "Run judge-scope comparison (binary vs full7)"}
        </button>
        <label className="claim-state-label">
          <input
            type="checkbox"
            checked={judgeScope === "full7"}
            onChange={(e) => setJudgeScope(e.target.checked ? "full7" : "binary")}
          />{" "}
          use full 7-way judge scope for &ldquo;Run evals&rdquo;
        </label>
      </div>

      {error && <div className="banner banner--warn" style={{ marginTop: "var(--space-2)" }}>{error}</div>}

      {compareReport && (
        <>
          <h2 className="section-heading">Judge-scope comparison: binary vs full7</h2>
          <p className="claim-state-label">
            Both configurations run on the free tier — no strong-model run exists to compare, so this measures the axis
            actually varied: how much verdict logic the model owns (full7) versus code (binary). Under binary, N1/N2/N3/N10
            pass by construction, not by model skill.
          </p>
          {diff && <DiffPanel diff={diff} />}
        </>
      )}

      {!compareReport && diff && (
        <>
          <h2 className="section-heading">Diff against committed baseline</h2>
          <DiffPanel diff={diff} />
        </>
      )}

      {report && (
        <>
          <ReproducibilityPanel report={report} />

          <div className="headline-row">
            <div className="headline-item">
              <span className="headline-item__label">False positive rate (must-not-flag)</span>
              <span className="headline-fraction">
                {headline!.falsePositiveRate.flagged}/{headline!.falsePositiveRate.mustNotFlagTotal} = {headline!.falsePositiveRate.rate}
              </span>
            </div>
            <div className="headline-item">
              <span className="headline-item__label">Contradiction recall</span>
              <span className="headline-fraction">
                {headline!.contradictionRecall.found}/{headline!.contradictionRecall.total}
              </span>
            </div>
            <div className="headline-item">
              <span className="headline-item__label">Span validity</span>
              <span className="headline-fraction">
                {headline!.spanValidity.valid}/{headline!.spanValidity.total} = {headline!.spanValidity.rate}
              </span>
            </div>
          </div>

          {report.escalation && (
            <>
              <h2 className="section-heading">Confidence-gated escalation router</h2>
              <p className="claim-state-label">
                {report.escalation.escalated === 0
                  ? "No bucket in this run self-reported confidence below the fixed threshold (0.6) — the router did not fire. Reported as-is, not tuned to look otherwise."
                  : `${report.escalation.escalated} bucket${report.escalation.escalated === 1 ? "" : "s"} self-reported confidence below the fixed threshold (0.6) and received a second, richer call. The escalated verdict changed the outcome in ${report.escalation.verdictChanged} of ${report.escalation.escalated}.`}
                {report.escalation.escalatedBuckets.length > 0 && (
                  <>
                    {" "}
                    Escalated: {report.escalation.escalatedBuckets.map((b, i) => (
                      <span key={b}>
                        {i > 0 && ", "}
                        <span className="mono-cell">{b}</span>
                      </span>
                    ))}
                    .
                  </>
                )}
              </p>
            </>
          )}

          <h2 className="section-heading">Adjudication (headline scenarios)</h2>
          <AdjudicationTable scores={report.adjudication} />

          <h2 className="section-heading">Contested (excluded from headline scoring)</h2>
          <p className="claim-state-label">
            C9 (reward_config.live_state) is genuinely arguable — both may be true simultaneously (a staged rollout or client
            cache). Reported here, never folded into headline precision.
          </p>
          <AdjudicationTable scores={report.contested} />

          <h2 className="section-heading">Extraction (per scenario)</h2>
          <p className="claim-state-label">
            Scored on claims and spans. Modality and polarity are scored separately from recall — a system that finds every
            claim but misreads N8&apos;s polarity fails visibly here, not averaged away.
          </p>
          <ExtractionTable scores={report.extraction} />

          <h2 className="section-heading">Counts</h2>
          <table className="claim-table">
            <tbody>
              <tr><td>Messages</td><td className="mono-cell">{report.counts.messages}</td></tr>
              <tr><td>Gated pre-extraction</td><td className="mono-cell">{report.counts.gated}</td></tr>
              <tr><td>Claims extracted</td><td className="mono-cell">{report.counts.claims}</td></tr>
              <tr><td>Rejected</td><td className="mono-cell">{report.counts.rejected}</td></tr>
              <tr><td>Buckets</td><td className="mono-cell">{report.counts.buckets}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
