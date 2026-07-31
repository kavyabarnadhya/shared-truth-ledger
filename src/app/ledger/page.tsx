"use client";

import { useEffect, useState } from "react";
import { VerdictChip } from "@/components/VerdictChip";
import { TraceTable } from "@/components/TraceTable";
import { formatIST, presentClaimState } from "@/lib/format";
import type { LedgerSnapshot, CastEntry } from "@/core/types";

/**
 * "What does the team currently believe about X" — the independently
 * useful Stage 1 view, browsable without any adjudication having run.
 * Referent buckets with claim history, filterable by referent substring.
 */
export default function LedgerPage() {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [cast, setCast] = useState<CastEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/ledger").then((r) => r.json()),
      fetch("/api/cast").then((r) => r.json()),
    ])
      .then(([ledgerJson, castJson]) => {
        setSnapshot(ledgerJson.snapshot ?? null);
        setCast(castJson.cast ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const castByHandle = new Map(cast.map((c) => [c.handle, c]));
  const buckets = (snapshot?.buckets ?? []).filter((b) =>
    filter.trim() ? b.referent.toLowerCase().includes(filter.toLowerCase()) : true,
  );

  return (
    <main className="page">
      <h1 className="page-title">Ledger</h1>
      <p className="page-subtitle">
        Browse referent buckets and answer &ldquo;what does the team currently believe about X&rdquo;, with claim history
        per referent. Independently useful without any contradiction having been detected.
      </p>

      {loading && <p className="claim-state-label">Loading...</p>}

      {!loading && !snapshot && (
        <div className="banner">
          No ledger built yet. Visit the Contradictions tab first to build one at the frozen as-of, then return here.
        </div>
      )}

      {snapshot && (
        <>
          <input
            type="text"
            placeholder="Filter by referent..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: "100%", marginBottom: "var(--space-3)", padding: "var(--space-1)" }}
          />

          <p className="claim-state-label">
            {buckets.length} referent bucket{buckets.length === 1 ? "" : "s"} as of {formatIST(snapshot.asOf)}
          </p>

          {buckets.map((bucket) => {
            const verdict = snapshot.verdicts.find((v) => v.bucket_key === bucket.referent);
            const liveClaims = bucket.claims.filter((bc) => bc.state === "live");
            return (
              <details key={bucket.referent} className="drilldown" style={{ marginBottom: "var(--space-2)" }}>
                <summary>
                  <span className="mono-cell">{bucket.referent}</span>
                  {verdict && (
                    <span style={{ marginLeft: "var(--space-2)" }}>
                      <VerdictChip verdict={verdict.verdict} />
                    </span>
                  )}
                </summary>

                <p>
                  <strong>Current belief:</strong>{" "}
                  {liveClaims.length === 0
                    ? "no live claim"
                    : liveClaims.map((bc) => `${bc.claim.value} (${castByHandle.get(bc.claim.asserter)?.name ?? bc.claim.asserter})`).join("; ")}
                </p>

                <table className="claim-table">
                  <thead>
                    <tr>
                      <th>Asserter</th>
                      <th>Timestamp</th>
                      <th>Value</th>
                      <th>State</th>
                      <th>Claim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...bucket.claims]
                      .sort((a, b) => (a.claim.timestamp < b.claim.timestamp ? -1 : 1))
                      .map((bc) => (
                        <tr key={bc.claim.claim_id}>
                          <td>{castByHandle.get(bc.claim.asserter)?.name ?? bc.claim.asserter}</td>
                          <td className="mono-cell">{formatIST(bc.claim.timestamp)}</td>
                          <td>{bc.claim.value}</td>
                          <td className="claim-state-label">{presentClaimState(bc.state)} — {bc.stateReason}</td>
                          <td className="mono-cell">{bc.claim.claim_id}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </details>
            );
          })}

          <h2 className="section-heading">Trace</h2>
          <p className="claim-state-label">
            Per pipeline step: model, tokens in/out, latency, cost — sourced from the gateway. Proves the two-tier cascade
            is real rather than claimed.
          </p>
          <TraceTable entries={snapshot.trace} />
        </>
      )}
    </main>
  );
}
