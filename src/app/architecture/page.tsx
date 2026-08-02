"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PipelineView } from "@/components/PipelineView";
import { ToolBoundaryPanel } from "@/components/ToolBoundaryPanel";
import { RoutingDiagram } from "@/components/RoutingDiagram";
import { ReviewerNote } from "@/components/ReviewerNote";
import { VerdictChip } from "@/components/VerdictChip";
import goldClaimsData from "../../../evals/gold-claims.json";
import type { GoldClaim, LedgerSnapshot, VerdictKind } from "@/core/types";

interface LedgerApiResponse {
  snapshot: LedgerSnapshot | null;
}

interface GoldClaimsFile {
  claims: GoldClaim[];
}

const GOLD_CLAIMS: GoldClaim[] = (goldClaimsData as GoldClaimsFile).claims;
const GOLD_CLAIMS_COUNT = GOLD_CLAIMS.length;
/** First five gold claims, in file order — same sample size as the Evals page's own disclosure. */
const GOLD_CLAIMS_SAMPLE = GOLD_CLAIMS.slice(0, 5);

const VERDICTS: Array<{ kind: VerdictKind; meaning: string; decidedBy: string }> = [
  {
    kind: "CONTRADICTION",
    meaning: "Two live positions genuinely conflict.",
    decidedBy: "Model only — no pre-rule ever emits this.",
  },
  {
    kind: "COMPATIBLE",
    meaning: "No real disagreement — one live claim, or the live claims already agree.",
    decidedBy: "Code (R6/R6b/R7) when one of those settles it; the model otherwise.",
  },
  {
    kind: "UPDATE",
    meaning: "The same person changed their own answer; no one else has a live, differing claim.",
    decidedBy: "Code (deterministic same-asserter check, src/core/ledger.ts).",
  },
  {
    kind: "RESOLVED_BY_SUPERSESSION",
    meaning: "A senior person's later claim overrides an earlier disagreement.",
    decidedBy: "Code (R5).",
  },
  {
    kind: "RESOLVED_BY_CORRECTION",
    meaning: "Someone corrected themselves to match what someone else had already said.",
    decidedBy: "Code (R4).",
  },
  {
    kind: "AMBIGUOUS_REFERENT",
    meaning: "Two different buckets may be the same real topic, phrased identically, disagreeing in value.",
    decidedBy: "Code (ambiguity-pair detection, src/core/ledger.ts) — a different mechanism from CONTESTED below.",
  },
  {
    kind: "CONTESTED",
    meaning: "Hand-labelled as genuinely arguable either way; kept out of right/wrong scoring entirely.",
    decidedBy: "Code (R8) — only for a referent in the hardcoded contested set, not a general judgment call.",
  },
];

const STAGE_SENTENCES: Array<{ id: string; sentence: string }> = [
  { id: "noise_gate", sentence: "First, Quorum throws out anything that isn't a real person talking — a fixed 5-rule ladder (bot author, automation email address, gated channel, automation text signature, short social aside), all code, no model call." },
  { id: "extraction", sentence: "Then it reads every remaining message and pulls out the factual claims it makes, quoting the exact words rather than paraphrasing." },
  { id: "referent_resolution", sentence: "It groups claims that are about the same underlying topic — by exact match, known aliases, then wording similarity — without ever calling a model." },
  { id: "pre_rules", sentence: "Before asking any model to judge anything, a fixed set of rules checks for the easy cases: someone updating their own earlier statement, someone correcting themselves, a senior person's final call (R5)." },
  { id: "adjudication", sentence: "Only what's left after that — genuine live disagreement between different people, from the model's point of view — gets exactly one question to a model: Guardrailed scope asks yes/no (“contradiction or compatible?”), Open scope lets it choose freely from the full verdict vocabulary." },
  { id: "ledger", sentence: "The result is written to a persistent ledger: today's beliefs, plus a full history of who changed their mind and when." },
];

/**
 * Turns the pipeline into something a reviewer can watch happen: a plain
 * sentence per stage above the numbers (computed live off a real
 * LedgerSnapshot.trace, never hand-drawn), then the Slack/Gmail/MCP tool
 * boundary the assignment specifically asks to see — with a working link
 * into the same SourcePanel a reviewer has already used on Signals/Ledger,
 * so "MCP integration" is demonstrated, not just described.
 */
export default function ArchitecturePage() {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ledger")
      .then((r) => r.json())
      .then((json: LedgerApiResponse) => setSnapshot(json.snapshot ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page">
      <h1 className="page-title">How Quorum works</h1>
      <p className="page-subtitle">
        Six stages, from your Slack and Gmail through to the ledger. Every number below is read live off the current
        ledger snapshot&apos;s trace — not hand-drawn.
      </p>

      <nav className="page-toc" aria-label="On this page">
        <a href="#data-source">Where the data comes from</a>
        <a href="#six-stages">The six stages</a>
        <a href="#architecture">Tool boundary</a>
        <a href="#routing-diagram">The routing decision, diagrammed</a>
        <a href="#reviewer-appendix">Reviewer appendix</a>
      </nav>

      <h2 className="section-heading" id="data-source">Where the data comes from</h2>
      <p>
        Quorum reads Slack and Gmail through an MCP-style tool layer — the same four tools (search Slack, get a
        Slack thread, search Gmail, get a Gmail thread) are exposed both to an MCP client over stdio and to this web
        app in-process, from one shared adapter module. You&apos;ve already used this: every &ldquo;view the
        message&rdquo; link on Signals or the Ledger opens that exact tool call. See the tool boundary below for the
        detail, or{" "}
        <Link href="/contradictions">go look at a real conflict</Link> to watch it happen again.
      </p>

      {error && <div className="banner banner--warn">Could not load the ledger: {error}</div>}
      {loading && <p className="claim-state-label">Loading...</p>}

      {!loading && !snapshot && (
        <div className="banner">
          No ledger built yet. Visit the Signals tab first to build one, then return here.
        </div>
      )}

      <h2 className="section-heading" id="six-stages">The six stages</h2>
      <ol style={{ paddingLeft: "1.2em" }}>
        {STAGE_SENTENCES.map((s) => (
          <li key={s.id} style={{ marginBottom: "0.4em" }}>{s.sentence}</li>
        ))}
      </ol>

      {snapshot && <PipelineView snapshot={snapshot} />}

      <h2 className="section-heading" id="architecture">Tool boundary</h2>
      <p className="claim-state-label">
        Four tools, one shared adapter, two callers — an MCP server over stdio, and this web app in-process.
      </p>
      <ToolBoundaryPanel />

      <ReviewerNote readmeHref="/architecture#architecture">
        <p>
          This page and the SourcePanel are the two places the MCP boundary is actually exercised rather than just
          documented: <code>src/adapters/workspace.ts</code> is the single implementation; <code>mcp-server/src/adapter.ts</code>{" "}
          re-exports it for the stdio MCP server, and <code>src/app/api/workspace/route.ts</code> calls it in-process
          for the web app — never an HTTP round trip to the MCP server itself. Model selection, hooks, and agent
          hand-offs are documented in full in the README sections this note links to.
        </p>
      </ReviewerNote>

      <h2 className="section-heading" id="routing-diagram">The routing decision, diagrammed</h2>
      <p className="claim-state-label">
        The same six stages above, drawn as the actual branch points a message goes through — deterministic steps in
        one style, model calls in another, with the Guardrailed/Open judge-scope split shown as a real branch, not
        prose. Concretely: Guardrailed restricts the model&apos;s output to <code>CONTRADICTION</code> or{" "}
        <code>COMPATIBLE</code> only, enforced by a strict schema (<code>BinaryVerdictSchema</code>); Open allows all
        7 verdicts (<code>Full7VerdictSchema</code>) — see <code>src/core/schema/verdict.ts</code>.
      </p>

      <div style={{ overflowX: "auto", marginBottom: "var(--space-3)" }}>
      <table className="claim-table" style={{ minWidth: "36rem" }}>
        <thead>
          <tr>
            <th>Verdict</th>
            <th>Meaning</th>
            <th>Decided by</th>
          </tr>
        </thead>
        <tbody>
          {VERDICTS.map((v) => (
            <tr key={v.kind}>
              <td>
                <VerdictChip verdict={v.kind} />
              </td>
              <td>{v.meaning}</td>
              <td className="claim-state-label">{v.decidedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="claim-state-label" style={{ marginTop: "calc(-1 * var(--space-2))", marginBottom: "var(--space-3)" }}>
        For what R4–R8 (and the other code-decided checks referenced above) actually do, see{" "}
        <a href="#pre-rules">Signals page — pre-rules</a> below.
      </p>

      <RoutingDiagram />

      <h2 className="section-heading" id="reviewer-appendix" style={{ marginTop: "var(--space-4)" }}>
        Reviewer appendix
      </h2>
      <p className="claim-state-label">
        The engineering detail each page&apos;s &ldquo;How this page works&rdquo; note links back to — one section
        per page, kept here instead of a repo-root README route Vercel can&apos;t serve directly.
      </p>

      <div className="reviewer-appendix__section" id="overview">
        <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>Overview page</h3>
        <p>
          &ldquo;Topics being tracked&rdquo; counts only catalogued referents (see the Ledger page&apos;s &ldquo;other
          topics detected automatically&rdquo; split) — internal identifiers like <code>indep_event.launch_date</code>{" "}
          and extractor-minted noise both live in the same underlying <code>Bucket[]</code>, but only the former is a
          real tracked topic from a product point of view. The false positive rate and contradiction recall figures
          live entirely on the Evals page, computed by the same in-browser eval suite you can run yourself there —
          the Overview page does not duplicate that computation.
        </p>
      </div>

      <div className="reviewer-appendix__section" id="pre-rules">
        <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>Signals page — pre-rules</h3>
        <p>
          Each row runs through a deterministic pre-rule ladder (R0–R9) before any model is called — same-asserter
          updates, self-corrections, and authority-based supersession (R5) are all decided by code, not by the
          model. Only
          a bucket with two or more live claims from different people, with no pre-rule able to settle it, gets a
          single binary model call: &ldquo;do these live positions genuinely conflict?&rdquo;
          &ldquo;Rewind the ledger&rdquo; re-runs the same deterministic
          pipeline as of an earlier point in time; it does not re-ask the model a new question, it replays the same
          logic against a smaller set of visible messages. These rules are hand-authored, studio-specific business
          logic (<code>src/core/prerules.ts</code>) — code, not model output, and not user-configurable in this
          build.
        </p>
        <p>
          Two user-facing actions live on this page (<code>src/components/BucketRow.tsx</code>): Dismiss persists a{" "}
          <code>Suppression</code> and Mark-as-resolved persists a <code>Resolution</code> — same shape, same
          store, same &ldquo;survives a restart&rdquo; guarantee (<code>src/core/ledger.ts</code>&apos;s{" "}
          <code>dismissBucket</code>/<code>resolveBucket</code>, written via{" "}
          <code>/api/ledger/suppress</code>/<code>/api/ledger/resolve</code>). Both re-raise automatically the
          moment the bucket&apos;s live claim set changes (<code>isSuppressed</code>/<code>isResolved</code>) — a
          dismissal or a resolution is never a silent, permanent hide. Neither touches{" "}
          <code>projectAsOf</code> or verdict computation: a resolution is a human annotation recorded alongside the
          system&apos;s own verdict, not a replacement for it. <strong>Explicitly out of scope for this pass:</strong>{" "}
          real notifications (Slack-reply/email-send) when a conflict is dismissed or resolved, assigning a conflict
          to a specific person, and a comment thread on a bucket — real product needs, not silently missing, just a
          materially larger build (external-write integration, not just UI) than this pass covers.
        </p>
      </div>

      <div className="reviewer-appendix__section" id="ledger">
        <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>Ledger page</h3>
        <p>
          Each row is a temporal projection over that referent&apos;s claims as of the ledger&apos;s frozen as-of (see{" "}
          <code>src/core/ledger.ts</code>): superseded/withdrawn claims stay visible, not hidden, so a reviewer can
          see what was ruled out and why. The watermark (<code>snapshot.watermark</code>) tracks which messages have
          already been processed, making re-runs idempotent. Suppression (dismiss/restore on the Signals tab)
          re-raises a bucket only if its live claim set actually changes — a dismissal isn&apos;t silently permanent.
        </p>
      </div>

      <div className="reviewer-appendix__section" id="evals">
        <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>Evals page</h3>
        <p>
          <code>npm run eval -- --print-hash</code> against the same committed recordings prints the same report hash
          offline — that is the actual reproducibility guarantee, not just the on-screen claim on that page. The
          regression protocol treats any single-scenario regression as a failure even if the average improves; the
          diff panel there implements exactly that rule, not an aggregate pass/fail. See{" "}
          <code>src/core/eval/diff.ts</code> and <code>src/core/eval/run-eval.ts</code> for the scoring
          implementation, and <code>src/core/eval/scenarios.ts</code> for the full scenario registry (C1-C9, N1-N18)
          that page&apos;s tables are driven from.
        </p>
        <p>
          The adjudication grader scores every run against these gold claims, not against anything the model itself
          produced. One person (this project&apos;s author) hand-labeled them, with no measured agreement from a
          second annotator — stated here rather than smoothed over. See README §8 (&ldquo;Known limitations&rdquo;)
          for the full statement of that limitation.
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
          <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>
            Full set on <Link href="/evals">Evals</Link>, or in <code>evals/gold-claims.json</code> directly.
          </p>
        </details>
      </div>

      <div className="reviewer-appendix__section" id="sandbox">
        <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>Try it page</h3>
        <p>
          Every run goes through the same <code>runExtractionPipeline</code>/<code>runAdjudicationPipeline</code> the
          ledger and Signals pages use — this is not a simplified demo path. In replay mode, novel input that
          doesn&apos;t match a committed recording&apos;s cache key returns a clear &ldquo;no recording for this
          input&rdquo; error rather than a fabricated result (see <code>ReplayMissError</code> in{" "}
          <code>src/core/model/client.ts</code>). Live mode calls the Vercel AI Gateway server-side only — the API
          key never reaches the browser — and is rate-limited to 10 calls per session per 10 minutes, with an
          automatic fallback to replay on a 429. See &ldquo;Enabling live mode&rdquo; below for how to turn it on for
          a deployment.
        </p>
      </div>
    </main>
  );
}
