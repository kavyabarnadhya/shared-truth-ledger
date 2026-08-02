"use client";

import { useState } from "react";
import { AdjudicationTable, ExtractionTable } from "@/components/ScenarioTable";
import { ReproducibilityPanel } from "@/components/GraderPanel";
import { DiffPanel } from "@/components/DiffPanel";
import { PromptViewer } from "@/components/DrillDown";
import { ReviewerNote } from "@/components/ReviewerNote";
import { SourcePanel, type SourcePanelTarget } from "@/components/SourcePanel";
import { EXTRACTION_PROMPT } from "@/core/prompts/extraction";
import { systemFor as adjudicationSystemFor, renderUser as renderAdjudicationUser } from "@/core/prompts/adjudication";
import { parseInstant } from "@/core/time";
import { MESSAGES as CORPUS_MESSAGES } from "@/corpus/bundled.generated";
import goldClaimsData from "../../../evals/gold-claims.json";
import goldVerdictsData from "../../../evals/gold-verdicts.json";
import type { EvalReport, EvalDiff, GoldClaim, GoldVerdictRow, JudgeScope, Message, Bucket } from "@/core/types";

const GOLD_CLAIMS: GoldClaim[] = (goldClaimsData as GoldClaimsFile).claims;
const GOLD_VERDICTS: GoldVerdictRow[] = (goldVerdictsData as GoldVerdictsFile).verdicts;
const GOLD_CLAIMS_COUNT = GOLD_CLAIMS.length;
const GOLD_VERDICTS_COUNT = GOLD_VERDICTS.length;
/** First five gold claims, in file order — a representative peek, not the
 * full set (the full set is the linked JSON file itself). */
const GOLD_CLAIMS_SAMPLE = GOLD_CLAIMS.slice(0, 5);

/** message_id -> thread_id, for "View the messages" (Part D): ScenarioDef only
 * carries messageIds, but SourcePanel opens by thread_id. The committed
 * corpus (same bundle the eval suite itself loads) is the only place that
 * mapping lives. */
const THREAD_ID_BY_MESSAGE_ID = new Map(CORPUS_MESSAGES.map((m) => [m.id, m.thread_id]));

interface GoldClaimsFile {
  claims: GoldClaim[];
}

interface GoldVerdictsFile {
  verdicts: GoldVerdictRow[];
}

const METRIC_GLOSSARY: Array<{ term: string; definition: string }> = [
  { term: "recall", definition: "Of the claims a person actually made, how many did we find." },
  { term: "precision", definition: "Of the claims we extracted, how many were real." },
  { term: "referent", definition: "Did we identify the right topic." },
  { term: "modality", definition: "Did we correctly tell an assertion apart from a question, hedge, or proposal." },
  { term: "polarity", definition: "Did we get \"yes\" vs \"no\" right." },
  { term: "spanValidity", definition: "Did the quote we cited actually exist in the message, verbatim." },
];

/**
 * Part B: one fixed, real corpus message (M-001, the flagship's opening
 * message — already used elsewhere in this app's examples) rendered through
 * the actual EXTRACTION_PROMPT.renderUser(), so the static prompt viewer
 * below shows the literal text sent to the model rather than a placeholder
 * description of it. No context messages: M-001 is the first message of its
 * thread, so contextMessages is genuinely empty here, same as at runtime.
 */
const WORKED_EXAMPLE_MESSAGE: Message = {
  id: "M-001",
  source: "slack",
  channel: "#liveops-ludojunction",
  thread_id: "T1",
  author: "meera.iyer",
  author_name: "Meera Iyer",
  author_role: "Product Manager",
  timestamp: parseInstant("2026-07-06T10:12:00+05:30"),
  text: "Kicking off planning for the Independence Day event. Working assumption is we go live 12 August, config frozen by the 5th so QA gets a clean week.",
  participants: ["meera.iyer"],
  is_load_bearing: true,
};

const WORKED_EXTRACTION_USER = EXTRACTION_PROMPT.renderUser({ message: WORKED_EXAMPLE_MESSAGE, contextMessages: [] });

/**
 * A worked adjudication example needs a Bucket — built here from the same
 * M-001 claim plus its real gold contradiction partner (M-002/CL-002, see
 * evals/gold-claims.json) so the rendered prompt shows the actual two-claim
 * shape the model receives for the flagship's C1 scenario, not a synthetic
 * one-off. Only fields renderUser() actually reads (referent, liveClaims)
 * need to be populated; the rest are structurally required by the Bucket
 * type but unused by this render.
 */
const WORKED_ADJUDICATION_BUCKET: Bucket = {
  referent: "indep_event.launch_date",
  claims: [],
  liveClaims: [
    {
      claim_id: "M-001#0", message_id: "M-001", referent: "indep_event.launch_date", raw_referent: "go live",
      predicate: "value", value: "2026-08-12", raw_value: "12 August", asserter: "meera.iyer",
      modality: "assertion", polarity: "positive", attributed_to: null,
      timestamp: parseInstant("2026-07-06T10:12:00+05:30"),
      source_span: "we go live 12 August", span_valid: true, span_offset: 75,
    },
    {
      claim_id: "M-002#0", message_id: "M-002", referent: "indep_event.launch_date", raw_referent: "Go-live",
      predicate: "value", value: "2026-08-15", raw_value: "15 August", asserter: "priya.raghunathan",
      modality: "assertion", polarity: "positive", attributed_to: null,
      timestamp: parseInstant("2026-07-15T18:22:00+05:30"),
      source_span: "Go-live is 15 August", span_valid: true, span_offset: 57,
    },
  ],
  asOf: parseInstant("2026-07-15T23:59:59+05:30"),
  preRuleTrace: [],
  preRuleVerdict: null,
  linkedReferents: [],
  contested: false,
};

const WORKED_ADJUDICATION_USER_BINARY = renderAdjudicationUser({ bucket: WORKED_ADJUDICATION_BUCKET, judgeScope: "binary" });
const WORKED_ADJUDICATION_USER_FULL7 = renderAdjudicationUser({ bucket: WORKED_ADJUDICATION_BUCKET, judgeScope: "full7" });

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
  const [sourceTarget, setSourceTarget] = useState<SourcePanelTarget | null>(null);

  function viewMessages(messageIds: string[]) {
    const threadId = messageIds.map((id) => THREAD_ID_BY_MESSAGE_ID.get(id)).find((t): t is string => t !== undefined);
    if (threadId) setSourceTarget({ thread_id: threadId });
  }

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
        How we know Quorum can be trusted: three things that could go wrong (false alarms, missed conflicts,
        invented quotes), each measured separately below against a human-labeled gold set — run it yourself, no API
        key, no network call.
      </p>

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

      <details className="drilldown" style={{ marginTop: "var(--space-2)" }}>
        <summary>Read the full eval methodology ↓</summary>
        <div style={{ marginTop: "var(--space-2)" }}>
          <h2 className="section-heading" style={{ marginTop: 0 }}>What could go wrong</h2>
          <ul>
            <li><strong>False alarms.</strong> Quorum tells you two people disagree when they don&apos;t — the fastest way to lose trust.</li>
            <li><strong>Missed conflicts.</strong> Two people genuinely disagree and Quorum stays silent.</li>
            <li><strong>Invented quotes.</strong> Quorum shows you words nobody actually wrote.</li>
          </ul>

          <h2 className="section-heading">How each is measured</h2>
          <ul>
            <li><strong>False alarm rate</strong> — how often a scenario that should never be flagged gets flagged anyway. Target: zero.</li>
            <li><strong>Conflicts caught</strong> — of the genuine disagreements in the test set, how many Quorum actually surfaces.</li>
            <li><strong>Quote accuracy</strong> — every highlighted phrase is checked character-for-character against the real message; a highlight that doesn&apos;t match the source is a failure, not a rounding error.</li>
          </ul>

          <h2 className="section-heading">Two separate graders</h2>
          <p>
            Extraction (did we correctly read what someone said) and judgment (did we correctly decide whether two
            readings conflict) are scored independently, on their own scenarios. A system that extracts perfectly but
            judges badly, or vice versa, cannot hide behind a single blended score — see the per-scenario tables below,
            never averaged into one number.
          </p>

          <h2 className="section-heading">What the frozen baseline shows</h2>
          <p>
            Run it yourself above and the section below fills in with a live diff against the committed baseline —
            including the one regression currently on record, kept visible rather than reset, because that is what
            catching a regression is supposed to look like.
          </p>

          <h2 className="section-heading">Guardrailed vs Open</h2>
          <p className="claim-state-label">
            <strong>Guardrailed</strong> (binary): the model answers exactly one question per topic — &ldquo;do these
            live positions genuinely disagree?&rdquo; — everything else (updates, corrections, who overrides whom) is decided by code before
            the model is ever called. <strong>Open</strong> (full7): the model chooses freely from the entire verdict
            vocabulary itself. Both run on the same free-tier model — this measures how much the guardrails change the
            outcome, not a cheap-vs-expensive model difference.
          </p>
        </div>
      </details>

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
          <p className="claim-state-label">
            &ldquo;REGRESSED&rdquo; means a scenario that was correct against the frozen, committed baseline
            (<code>evals/baseline.json</code>) is now wrong in this run — caught automatically by comparing this
            run&apos;s report to the committed one, not eyeballed. The protocol treats any single regression as a
            failure even when the overall average improves, so a regression stays visible here rather than getting
            averaged away by an improvement elsewhere.
          </p>
          <DiffPanel diff={diff} />
        </>
      )}

      {report && (
        <>
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

          <h2 className="section-heading">The ground truth</h2>
          <p className="claim-state-label">
            Every score above is measured against a human-labeled gold set — <code>evals/gold-claims.json</code> (
            {" "}{GOLD_CLAIMS_COUNT} claims) and <code>evals/gold-verdicts.json</code> ({GOLD_VERDICTS_COUNT} verdicts) —
            not against anything the model itself produced. One annotator (this project&apos;s author) labeled both
            files; there is no measured inter-annotator agreement. See README §8 (&ldquo;Known limitations&rdquo;) for
            the full statement of that limitation — not restated differently here.
          </p>
          <details className="drilldown">
            <summary>view a sample of the gold claims ({GOLD_CLAIMS_SAMPLE.length} of {GOLD_CLAIMS_COUNT})</summary>
            <table className="claim-table" style={{ marginTop: "var(--space-2)" }}>
              <thead>
                <tr>
                  <th>Claim id</th>
                  <th>Message</th>
                  <th>Referent</th>
                  <th>Value</th>
                  <th>Asserter</th>
                </tr>
              </thead>
              <tbody>
                {GOLD_CLAIMS_SAMPLE.map((c) => (
                  <tr key={c.claim_id}>
                    <td className="mono-cell">{c.claim_id}</td>
                    <td className="mono-cell">{c.message_id}</td>
                    <td className="mono-cell">{c.referent}</td>
                    <td>{c.value}</td>
                    <td className="mono-cell">{c.asserter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <h2 className="section-heading">Judgment (headline scenarios)</h2>
          <AdjudicationTable scores={report.adjudication} onViewMessages={viewMessages} />

          <h2 className="section-heading">Contested (excluded from the headline score)</h2>
          <p className="claim-state-label">
            One scenario is genuinely arguable either way — both readings may be true simultaneously. Reported here,
            never folded into the headline score as if it were simply right or wrong.
          </p>
          <AdjudicationTable scores={report.contested} onViewMessages={viewMessages} />

          <h2 className="section-heading">Extraction (per scenario)</h2>
          <p className="claim-state-label">
            Scored on claims and quotes. What was said and how it was categorised are scored separately from
            recall — a run that finds every claim but misreads one scenario&apos;s polarity fails visibly here, not
            averaged away.
          </p>
          <details className="drilldown">
            <summary>metric glossary (recall, precision, referent, modality, polarity, span validity)</summary>
            <table className="claim-table" style={{ marginTop: "var(--space-2)" }}>
              <tbody>
                {METRIC_GLOSSARY.map((g) => (
                  <tr key={g.term}>
                    <td className="mono-cell" style={{ width: "9em" }}>{g.term}</td>
                    <td className="claim-state-label">{g.definition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <ExtractionTable scores={report.extraction} onViewMessages={viewMessages} />

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

          <ReproducibilityPanel report={report} />
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

      <details className="drilldown">
        <summary>The actual prompts sent to the model</summary>
        <div style={{ marginTop: "var(--space-2)" }}>
          <p className="claim-state-label">
            Exactly what&apos;s sent to the model — no scenario-specific hints, no few-shot examples encoding the
            right answer. &ldquo;System&rdquo; is the fixed instructions sent on every call. &ldquo;User&rdquo;
            below is not a description of what would be sent — it is <strong>a worked example</strong>: the literal,
            real output of <code>renderUser()</code> for M-001, the flagship bucket&apos;s opening message
            (&ldquo;Kicking off planning for the Independence Day event...&rdquo;), exactly as the model receives it.
          </p>
          <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>Extraction (reads a message, emits claims) — system prompt:</p>
          <PromptViewer system={EXTRACTION_PROMPT.SYSTEM} user={WORKED_EXTRACTION_USER} />
          <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>
            Judgment, Guardrailed (binary) scope — system prompt, and a worked example built from M-001&apos;s claim plus
            its real gold contradiction partner (M-002, the C1 scenario):
          </p>
          <PromptViewer system={adjudicationSystemFor("binary")} user={WORKED_ADJUDICATION_USER_BINARY} />
          <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>Judgment, Open (full7) scope — same worked example, different system prompt:</p>
          <PromptViewer system={adjudicationSystemFor("full7")} user={WORKED_ADJUDICATION_USER_FULL7} />
        </div>
      </details>

      <SourcePanel target={sourceTarget} onClose={() => setSourceTarget(null)} />

      <ReviewerNote readmeHref="/architecture#evals">
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
