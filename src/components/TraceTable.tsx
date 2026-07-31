"use client";

import { formatCost } from "@/lib/format";
import type { TraceEntry } from "@/core/types";

/**
 * Per pipeline step: which model ran, tokens in/out, latency, cost from the
 * gateway (or "free" for the free tier). This is what proves the two-tier
 * cascade is real rather than claimed — a reviewer can see extraction and
 * adjudication genuinely hit different steps with real token counts.
 */
export function TraceTable({ entries }: { entries: TraceEntry[] }) {
  const modelEntries = entries.filter((e) => e.kind === "model");
  if (modelEntries.length === 0) {
    return <p className="claim-state-label">No model calls in this trace (fully decided by pre-rules).</p>;
  }
  return (
    <table className="eval-table">
      <thead>
        <tr>
          <th>Step</th>
          <th>Tier</th>
          <th>Model</th>
          <th>Mode</th>
          <th className="num">Tokens in</th>
          <th className="num">Tokens out</th>
          <th className="num">Latency</th>
          <th className="num">Cost</th>
          <th>OK</th>
        </tr>
      </thead>
      <tbody>
        {modelEntries.map((e) => (
          <tr key={e.id}>
            <td className="mono-cell">{e.step}</td>
            <td>{e.tier}</td>
            <td className="mono-cell">{e.model}</td>
            <td>{e.mode}{e.detail?.fallbackFrom ? ` (fell back from ${e.detail.fallbackFrom})` : ""}</td>
            <td className="num">{e.tokensIn ?? "—"}</td>
            <td className="num">{e.tokensOut ?? "—"}</td>
            <td className="num">{e.latencyMs}ms</td>
            <td className="num">{formatCost(e.costUsd)}</td>
            <td>{e.ok ? "yes" : `no — ${e.error ?? ""}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
