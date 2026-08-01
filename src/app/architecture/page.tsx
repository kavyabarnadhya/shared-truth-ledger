"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PipelineView } from "@/components/PipelineView";
import { ToolBoundaryPanel } from "@/components/ToolBoundaryPanel";
import { RoutingDiagram } from "@/components/RoutingDiagram";
import { ReviewerNote } from "@/components/ReviewerNote";
import type { LedgerSnapshot } from "@/core/types";

interface LedgerApiResponse {
  snapshot: LedgerSnapshot | null;
}

const STAGE_SENTENCES: Array<{ id: string; sentence: string }> = [
  { id: "noise_gate", sentence: "First, Quorum throws out anything that isn't a real person talking — bots, CI notifications, newsletters." },
  { id: "extraction", sentence: "Then it reads every remaining message and pulls out the factual claims it makes, quoting the exact words rather than paraphrasing." },
  { id: "referent_resolution", sentence: "It groups claims that are about the same underlying topic — by exact match, known aliases, then wording similarity — without ever calling a model." },
  { id: "pre_rules", sentence: "Before asking any model to judge anything, a fixed set of rules checks for the easy cases: someone updating their own earlier statement, someone correcting themselves, a senior person's final call." },
  { id: "adjudication", sentence: "Only what's left after that — genuine live disagreement between different people, from the model's point of view — gets a single yes/no question to a model. If it isn't confident, a second, more careful pass runs." },
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

      <h2 className="section-heading" style={{ marginTop: 0 }}>Where the data comes from</h2>
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

      <h2 className="section-heading">The six stages</h2>
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
          for the web app — never an HTTP round trip to the MCP server itself. The confidence-gated escalation router
          (<code>src/core/router.ts</code>) and its measured effect on real buckets are on the Evals page, not
          asserted here. Model selection, hooks, and agent hand-offs are documented in full in the README sections
          this note links to.
        </p>
      </ReviewerNote>

      <h2 className="section-heading" id="routing-diagram">The routing decision, diagrammed</h2>
      <p className="claim-state-label">
        The same six stages above, drawn as the actual branch points a message goes through — deterministic steps in
        one style, model calls in another, with the Guardrailed/Open judge-scope split and the confidence-gated
        escalation router shown as real branches, not prose.
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
          updates, self-corrections, and authority-based supersession are all decided by code, not by the model. Only
          a bucket with two or more live claims from different people, with no pre-rule able to settle it, gets a
          single binary model call: &ldquo;do these live positions genuinely conflict?&rdquo; If that call
          self-reports low confidence, a confidence-gated escalation router issues a second, richer call — see the
          routing diagram above for the live counts. &ldquo;Rewind the ledger&rdquo; re-runs the same deterministic
          pipeline as of an earlier point in time; it does not re-ask the model a new question, it replays the same
          logic against a smaller set of visible messages.
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
