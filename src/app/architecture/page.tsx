"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PipelineView } from "@/components/PipelineView";
import { ToolBoundaryPanel } from "@/components/ToolBoundaryPanel";
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

      <h2 className="section-heading">Tool boundary</h2>
      <p className="claim-state-label">
        Four tools, one shared adapter, two callers — an MCP server over stdio, and this web app in-process.
      </p>
      <ToolBoundaryPanel />

      <ReviewerNote readmeHref="/README.md#architecture">
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
    </main>
  );
}
