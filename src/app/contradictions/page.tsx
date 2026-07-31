"use client";

import { useCallback, useEffect, useState } from "react";
import { AsOfControl, AS_OF_PRESETS } from "@/components/AsOfControl";
import { BucketRow } from "@/components/BucketRow";
import type { LedgerSnapshot, CastEntry } from "@/core/types";

interface LedgerApiResponse {
  snapshot: LedgerSnapshot | null;
  storeInfo: { kind: "file" | "memory"; durable: boolean; location: string };
}

export default function ContradictionsPage() {
  const [asOf, setAsOf] = useState(AS_OF_PRESETS[2]!.value);
  const [data, setData] = useState<LedgerApiResponse | null>(null);
  const [cast, setCast] = useState<CastEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async (nextAsOf: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asOf: nextAsOf, judgeScope: "binary" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `request failed (${res.status})`);
      }
      const json = (await res.json()) as LedgerApiResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    build(asOf);
    fetch("/api/cast")
      .then((r) => r.json())
      .then((j) => setCast(j.cast ?? []))
      .catch(() => setCast([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAsOfChange = (value: string) => {
    setAsOf(value);
    build(value);
  };

  async function dismiss(bucketKey: string) {
    await fetch("/api/ledger/suppress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bucket_key: bucketKey, dismissedBy: "meera.iyer" }),
    });
    build(asOf);
  }

  async function restore(bucketKey: string) {
    await fetch("/api/ledger/suppress", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bucket_key: bucketKey }),
    });
    build(asOf);
  }

  const snapshot = data?.snapshot;
  const suppressedKeys = new Set((snapshot?.suppressions ?? []).map((s) => s.bucket_key));

  const contradictionVerdicts = new Set(["CONTRADICTION", "CONTESTED", "AMBIGUOUS_REFERENT"]);
  const openBuckets =
    snapshot?.buckets.filter((b) => {
      const v = snapshot.verdicts.find((vv) => vv.bucket_key === b.referent);
      if (!v || !contradictionVerdicts.has(v.verdict)) return false;
      return !suppressedKeys.has(b.referent);
    }) ?? [];
  const dismissedBuckets =
    snapshot?.buckets.filter((b) => suppressedKeys.has(b.referent)) ?? [];

  return (
    <main className="page">
      <h1 className="page-title">Contradictions</h1>
      <p className="page-subtitle">
        Open conflicts between live claims — what the team currently disagrees with itself about.
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
        <AsOfControl value={asOf} onChange={handleAsOfChange} />
        {data?.storeInfo && (
          <span className="claim-state-label">
            ledger store: {data.storeInfo.kind} ({data.storeInfo.durable ? "survives restart" : "does not survive restart"})
          </span>
        )}
      </div>

      {error && <div className="banner banner--warn">Could not load the ledger: {error}</div>}
      {loading && <p className="claim-state-label">Building ledger...</p>}

      {!loading && !error && (
        <>
          <h2 className="section-heading">Open ({openBuckets.length})</h2>
          {openBuckets.length === 0 && <p className="claim-state-label">No open contradictions at this as-of.</p>}
          {openBuckets.map((bucket) => (
            <BucketRow
              key={bucket.referent}
              bucket={bucket}
              verdict={snapshot?.verdicts.find((v) => v.bucket_key === bucket.referent)}
              cast={cast}
              onDismiss={dismiss}
            />
          ))}

          {dismissedBuckets.length > 0 && (
            <>
              <h2 className="section-heading">Dismissed ({dismissedBuckets.length})</h2>
              {dismissedBuckets.map((bucket) => (
                <BucketRow
                  key={bucket.referent}
                  bucket={bucket}
                  verdict={snapshot?.verdicts.find((v) => v.bucket_key === bucket.referent)}
                  cast={cast}
                  onRestore={restore}
                  isDismissed
                />
              ))}
            </>
          )}
        </>
      )}
    </main>
  );
}
