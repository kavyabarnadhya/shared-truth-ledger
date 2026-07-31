"use client";

import { useEffect, useState } from "react";
import { PipelineView } from "@/components/PipelineView";
import { ToolBoundaryPanel } from "@/components/ToolBoundaryPanel";
import type { LedgerSnapshot } from "@/core/types";

interface LedgerApiResponse {
  snapshot: LedgerSnapshot | null;
}

/**
 * Turns the deterministic/model split from a README paragraph into
 * something clickable with real numbers, computed from an actual
 * LedgerSnapshot.trace (PipelineView) — plus the MCP/adapter tool boundary
 * the brief says it will look at, surfaced on screen instead of buried in
 * README §7.
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
      <h1 className="page-title">Architecture</h1>
      <p className="page-subtitle">
        Six pipeline stages, sources through to the ledger. Every number below is read live off the current ledger
        snapshot&apos;s trace — not hand-drawn.
      </p>

      {error && <div className="banner banner--warn">Could not load the ledger: {error}</div>}
      {loading && <p className="claim-state-label">Loading...</p>}

      {!loading && !snapshot && (
        <div className="banner">
          No ledger built yet. Visit the Signals tab first to build one at the frozen as-of, then return here.
        </div>
      )}

      {snapshot && <PipelineView snapshot={snapshot} />}

      <h2 className="section-heading">Tool boundary</h2>
      <p className="claim-state-label">
        The MCP/adapter boundary the brief asks to see: four tools, one shared adapter, two callers.
      </p>
      <ToolBoundaryPanel />
    </main>
  );
}
