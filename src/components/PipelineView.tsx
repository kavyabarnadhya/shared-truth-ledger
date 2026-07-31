"use client";

import { useState } from "react";
import { PromptViewer } from "@/components/DrillDown";
import type { LedgerSnapshot } from "@/core/types";

interface StageStat {
  label: string;
  value: string;
}

interface Stage {
  id: string;
  title: string;
  kind: "deterministic" | "model";
  summary: string;
  stats: StageStat[];
}

/**
 * Renders the six pipeline stages from a real LedgerSnapshot.trace — no
 * hand-drawn ASCII, no hardcoded counts. Each number below is computed live
 * from the snapshot passed in, so this view breaks (visibly, via NaN/empty)
 * rather than silently drifting from what the trace actually recorded if
 * pipeline.ts ever changes shape.
 */
export function PipelineView({ snapshot }: { snapshot: LedgerSnapshot }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const trace = snapshot.trace;
  const noiseGateEntries = trace.filter((t) => t.step.startsWith("noise_gate"));
  const gatedCount = snapshot.gatedMessageIds.length;
  const passedCount = noiseGateEntries.length - gatedCount;

  const extractionEntries = trace.filter((t) => t.kind === "model" && t.tier === "extraction");
  const extractionModel = extractionEntries[0]?.model ?? "n/a";

  const preRuleFirings = snapshot.buckets.flatMap((b) => b.preRuleTrace);
  const decidedByPreRule = snapshot.verdicts.filter((v) => v.decidedBy === "pre_rule").length;
  const totalVerdicts = snapshot.verdicts.length;

  const adjudicationEntries = trace.filter((t) => t.kind === "model" && t.tier === "adjudication");
  const primaryAdjEntries = adjudicationEntries.filter((t) => !t.step.includes("[escalated]"));
  const escalatedAdjEntries = adjudicationEntries.filter((t) => t.step.includes("[escalated]"));
  const adjudicationModel = adjudicationEntries[0]?.model ?? "n/a";

  const stages: Stage[] = [
    {
      id: "noise_gate",
      title: "1. Noise gate",
      kind: "deterministic",
      summary: "Messages in, gated messages dropped before extraction ever sees them.",
      stats: [
        { label: "messages seen", value: String(noiseGateEntries.length) },
        { label: "gated", value: String(gatedCount) },
        { label: "passed to extraction", value: String(passedCount) },
      ],
    },
    {
      id: "extraction",
      title: "2. Extraction",
      kind: "model",
      summary: "Per-message claim extraction on the free tier.",
      stats: [
        { label: "model", value: extractionModel },
        { label: "calls", value: String(extractionEntries.length) },
        { label: "claims extracted", value: String(snapshot.claims.length) },
        { label: "rejected", value: String(snapshot.rejectedClaims.length) },
      ],
    },
    {
      id: "referent_resolution",
      title: "3. Referent resolution",
      kind: "deterministic",
      summary: "Normalisation, alias table, lexical similarity — 0 model calls. Embeddings consulted only as a tiebreak inside an ambiguous similarity band (see src/core/referent.ts and referent.test.ts for the per-case trace; ReferentResolution.notes is not persisted onto the ledger snapshot, so a live tiebreak count is not shown here rather than approximated).",
      stats: [
        { label: "model calls", value: "0" },
        { label: "buckets resolved", value: String(snapshot.buckets.length) },
      ],
    },
    {
      id: "pre_rules",
      title: "4. Pre-rules R0–R9",
      kind: "deterministic",
      summary: "Deterministic ladder deciding UPDATE / RESOLVED_BY_* / AMBIGUOUS_REFERENT before the model is ever called.",
      stats: [
        { label: "rules fired", value: String(preRuleFirings.length) },
        { label: "verdicts decided before model called", value: `${decidedByPreRule}/${totalVerdicts}` },
      ],
    },
    {
      id: "adjudication",
      title: "5. Adjudication",
      kind: "model",
      summary: "Binary judge scope: exactly one question per bucket. Confidence-gated escalation router issues a second, richer call when the primary's self-reported confidence comes back below the fixed threshold.",
      stats: [
        { label: "model", value: adjudicationModel },
        { label: "primary calls", value: String(primaryAdjEntries.length) },
        { label: "escalated calls", value: String(escalatedAdjEntries.length) },
      ],
    },
    {
      id: "ledger",
      title: "6. Ledger + suppression",
      kind: "deterministic",
      summary: "Verdicts, claims, and suppressions persisted to the active LedgerStore.",
      stats: [
        { label: "buckets persisted", value: String(snapshot.buckets.length) },
        { label: "verdicts persisted", value: String(snapshot.verdicts.length) },
        { label: "active suppressions", value: String(snapshot.suppressions.length) },
      ],
    },
  ];

  return (
    <div>
      {stages.map((stage) => (
        <div key={stage.id} className="bucket-row-details" style={{ borderBottom: "1px solid var(--rule)", padding: "var(--space-2) 0" }}>
          <button
            className="bucket-row"
            style={{ border: "none" }}
            onClick={() => setExpanded((cur) => (cur === stage.id ? null : stage.id))}
            aria-expanded={expanded === stage.id}
          >
            <span>
              <strong>{stage.title}</strong>
              <span className="claim-state-label" style={{ marginLeft: "var(--space-2)" }}>
                {stage.kind === "deterministic" ? "deterministic" : "model"}
              </span>
            </span>
            <span className="bucket-row__meta">
              {stage.stats.map((s) => (
                <span key={s.label}>
                  {s.value} {s.label}
                </span>
              ))}
            </span>
          </button>
          {expanded === stage.id && (
            <div className="bucket-row__details">
              <p>{stage.summary}</p>
              {stage.id === "adjudication" && escalatedAdjEntries.length > 0 && (
                <div>
                  <p className="claim-state-label">Escalated calls in this trace:</p>
                  {escalatedAdjEntries.map((e) => (
                    <PromptViewer key={e.id} system={e.promptRef?.system ?? ""} user={e.promptRef?.user ?? ""} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
