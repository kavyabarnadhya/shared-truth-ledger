"use client";

import { useState } from "react";
import { AdjudicationTable, ExtractionTable } from "@/components/ScenarioTable";
import { ReproducibilityPanel } from "@/components/GraderPanel";
import { DiffPanel } from "@/components/DiffPanel";
import { PromptViewer } from "@/components/DrillDown";
import { ReviewerNote } from "@/components/ReviewerNote";
import { EXTRACTION_PROMPT } from "@/core/prompts/extraction";
import { systemFor as adjudicationSystemFor } from "@/core/prompts/adjudication";
import type { EvalReport, EvalDiff, GoldClaim, JudgeScope } from "@/core/types";

interface GoldClaimsFile {
  claims: GoldClaim[];
}

const PRE_RULES: Array<{ id: string; description: string }> = [
  { id: "R1", description: "Someone relaying what another person said doesn't count as their own claim — excluded from the disagreement." },
  { id: "R1b", description: "A hedge, a proposal, or a question isn't a statement of fact — excluded." },
  { id: "R2", description: "The same person said something different later — their earlier message is retired in favour of the later one." },
  { id: "R3", description: "Someone explicitly said what something is NOT — checked against their own other positions rather than read as a fact itself." },
  { id: "R4", description: "Someone corrected themselves to match what someone else already said — read as a correction, not an open conflict." },
  { id: "R5", description: "The most senior person in the thread made the final call — it overrides the earlier disagreement." },
  { id: "R6", description: "Only one current position remains — nothing left to disagree about." },
  { id: "R6b", description: "More than one current position, but they all agree — not a conflict." },
  { id: "R7", description: "No current position remains at all — nothing to disagree about." },
  { id: "R8", description: "Genuinely arguable both ways — kept in its own \"contested\" bucket rather than scored as right or wrong." },
];

/**
 * Runs the eval suite in the browser on demand against the committed
 * recordings — no API key, a few seconds. Restructured as the actual
 * argument rather than a metrics dump: what could go wrong, how each is
 * measured in plain English, why extraction and judgment are graded
 * separately, what the frozen baseline shows right now, and a live run you
 * can trigger yourself.
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
      setCompareReport(null);

      try {
        const baselineModule = (await import("../../../evals/baseline.json")) as unknown as {
          default: EvalReport | { _placeholder: true };
        };
        const baseline = baselineModule.default;
        if ("schemaVersion" in baseline) {
          const { diffReports } = await import("@/core/eval/diff");
          setDiff(diffReports(baseline, result));
        } else {
          setDiff(null);
        }
      } catch {
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
        How we know Quorum can be trusted: what could go wrong, how each risk is measured, and a live run against the
        same recordings this page is scored from — no API key, no network call.
      </p>

      <h2 className="section-heading" style={{ marginTop: 0 }}>1. What could go wrong</h2>
      <ul>
        <li><strong>False alarms.</strong> Quorum tells you two people disagree when they don&apos;t — the fastest way to lose trust.</li>
        <li><strong>Missed conflicts.</strong> Two people genuinely disagree and Quorum stays silent.</li>
        <li><strong>Invented quotes.</strong> Quorum shows you words nobody actually wrote.</li>
      </ul>

      <h2 className="section-heading">2. How each is measured</h2>
      <ul>
        <li><strong>False alarm rate</strong> — how often a scenario that should never be flagged gets flagged anyway. Target: zero.</li>
        <li><strong>Conflicts caught</strong> — of the genuine disagreements in the test set, how many Quorum actually surfaces.</li>
        <li><strong>Quote accuracy</strong> — every highlighted phrase is checked character-for-character against the real message; a highlight that doesn&apos;t match the source is a failure, not a rounding error.</li>
      </ul>

      <h2 className="section-heading">3. Two separate graders</h2>
      <p>
        Extraction (did we correctly read what someone said) and judgment (did we correctly decide whether two
        readings conflict) are scored independently, on their own scenarios. A system that extracts perfectly but
        judges badly, or vice versa, cannot hide behind a single blended score — see the per-scenario tables below,
        never averaged into one number.
      </p>

      <h2 className="section-heading">4. What the frozen baseline shows</h2>
      <p>
        Run it yourself below and this section fills in with a live diff against the committed baseline — including
        the one regression currently on record, kept visible rather than reset, because that is what catching a
        regression is supposed to look like.
      </p>

      <h2 className="section-heading">5. Run it yourself</h2>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={runSuite} disabled={running}>
          {running ? "Running..." : "Run evals"}
        </button>
        <button onClick={runComparison} disabled={running}>
          {running ? "Running..." : "Compare Guardrailed vs Open"}
        </button>
        <label className="claim-state-label">
          <input
            type="checkbox"
            checked={judgeScope === "full7"}
            onChange={(e) => setJudgeScope(e.target.checked ? "full7" : "binary")}
          />{" "}
          use the Open judge for &ldquo;Run evals&rdquo;
        </label>
      </div>
      <p className="claim-state-label" style={{ marginTop: "var(--space-1)" }}>
        <strong>Guardrailed</strong> (binary): the model answers exactly one question per topic — &ldquo;do these
        live positions genuinely disagree?&rdquo; — everything else (updates, corrections, who overrides whom) is decided by code before
        the model is ever called. <strong>Open</strong> (full7): the model chooses freely from the entire verdict
        vocabulary itself. Both run on the same free-tier model — this measures how much the guardrails change the
        outcome, not a cheap-vs-expensive model difference.
      </p>

      {error && <div className="banner banner--warn" style={{ marginTop: "var(--space-2)" }}>{error}</div>}

      {compareReport && (
        <>
          <h3 className="section-heading">Guardrailed vs Open — what actually changed</h3>
          {diff && <DiffPanel diff={diff} />}
        </>
      )}

      {!compareReport && diff && (
        <>
          <h3 className="section-heading">Diff against the committed baseline</h3>
          <DiffPanel diff={diff} />
        </>
      )}

      {report && (
        <>
          <ReproducibilityPanel report={report} />

          <div className="headline-row">
            <div className="headline-item">
              <span className="headline-item__label">False alarm rate</span>
              <span className="headline-fraction">
                {headline!.falsePositiveRate.flagged}/{headline!.falsePositiveRate.mustNotFlagTotal} = {headline!.falsePositiveRate.rate}
              </span>
            </div>
            <div className="headline-item">
              <span className="headline-item__label">Conflicts caught</span>
              <span className="headline-fraction">
                {headline!.contradictionRecall.found}/{headline!.contradictionRecall.total}
              </span>
            </div>
            <div className="headline-item">
              <span className="headline-item__label">Quote accuracy</span>
              <span className="headline-fraction">
                {headline!.spanValidity.valid}/{headline!.spanValidity.total} = {headline!.spanValidity.rate}
              </span>
            </div>
          </div>

          {report.escalation && (
            <>
              <h2 className="section-heading">Confidence-gated escalation</h2>
              <p className="claim-state-label">
                {report.escalation.escalated === 0
                  ? "No topic in this run self-reported low confidence — the escalation path did not fire. Reported as-is, not tuned to look otherwise."
                  : `${report.escalation.escalated} topic${report.escalation.escalated === 1 ? "" : "s"} self-reported low confidence and got a second, more careful look. That changed the outcome in ${report.escalation.verdictChanged} of ${report.escalation.escalated}.`}
              </p>
            </>
          )}

          <h2 className="section-heading">Judgment (headline scenarios)</h2>
          <AdjudicationTable scores={report.adjudication} />

          <h2 className="section-heading">Contested (excluded from the headline score)</h2>
          <p className="claim-state-label">
            One scenario is genuinely arguable either way — both readings may be true simultaneously. Reported here,
            never folded into the headline score as if it were simply right or wrong.
          </p>
          <AdjudicationTable scores={report.contested} />

          <h2 className="section-heading">Extraction (per scenario)</h2>
          <p className="claim-state-label">
            Scored on claims and quotes. What was said and how it was categorised are scored separately from
            recall — a run that finds every claim but misreads one scenario&apos;s polarity fails visibly here, not
            averaged away.
          </p>
          <ExtractionTable scores={report.extraction} />

          <h2 className="section-heading">Counts</h2>
          <table className="claim-table">
            <tbody>
              <tr><td>Messages</td><td className="mono-cell">{report.counts.messages}</td></tr>
              <tr><td>Filtered out before reading (bots, newsletters)</td><td className="mono-cell">{report.counts.gated}</td></tr>
              <tr><td>Claims extracted</td><td className="mono-cell">{report.counts.claims}</td></tr>
              <tr><td>Rejected</td><td className="mono-cell">{report.counts.rejected}</td></tr>
              <tr><td>Topics</td><td className="mono-cell">{report.counts.buckets}</td></tr>
            </tbody>
          </table>
        </>
      )}

      <h2 className="section-heading">Deterministic rules (R1–R8)</h2>
      <p className="claim-state-label">
        Applied to every topic before any model is called. If a rule fully settles the question, the model is never
        invoked for that topic at all.
      </p>
      <table className="claim-table">
        <tbody>
          {PRE_RULES.map((r) => (
            <tr key={r.id}>
              <td className="mono-cell" style={{ width: "3em" }}>{r.id}</td>
              <td>{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section-heading">The actual prompts</h2>
      <p className="claim-state-label">Exactly what&apos;s sent to the model — no scenario-specific hints, no few-shot examples encoding the right answer.</p>
      <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>Extraction (reads a message, emits claims):</p>
      <PromptViewer system={EXTRACTION_PROMPT.SYSTEM} user="(rendered per-message: author, role, and the message text itself — see src/core/prompts/extraction.ts's renderUser)" />
      <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>Judgment, Guardrailed (binary) scope:</p>
      <PromptViewer system={adjudicationSystemFor("binary")} user="(rendered per-topic: the live claims under dispute — see src/core/prompts/adjudication.ts's renderUser)" />
      <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>Judgment, Open (full7) scope:</p>
      <PromptViewer system={adjudicationSystemFor("full7")} user="(same rendering as the Guardrailed scope, different system prompt)" />

      <ReviewerNote readmeHref="/README.md#evals">
        <p>
          <code>npm run eval -- --print-hash</code> against the same committed recordings prints the same report hash
          offline — that is the actual reproducibility guarantee, not just the on-screen claim above. The regression
          protocol treats any single-scenario regression as a failure even if the average improves; the diff panel
          above implements exactly that rule, not an aggregate pass/fail. See <code>src/core/eval/diff.ts</code> and{" "}
          <code>src/core/eval/run-eval.ts</code> for the scoring implementation, and{" "}
          <code>src/core/eval/scenarios.ts</code> for the full scenario registry (C1-C9, N1-N18) this page&apos;s
          tables are driven from.
        </p>
      </ReviewerNote>
    </main>
  );
}
