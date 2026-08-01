"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AsOfControl, AS_OF_PRESETS } from "@/components/AsOfControl";
import { BucketRow } from "@/components/BucketRow";
import { SourcePanel, type SourcePanelTarget } from "@/components/SourcePanel";
import { ReviewerNote } from "@/components/ReviewerNote";
import { VerdictChip } from "@/components/VerdictChip";
import { conflictTitle } from "@/lib/display";
import type { LedgerSnapshot, CastEntry, Message, VerdictKind, Verdict } from "@/core/types";

interface LedgerApiResponse {
  snapshot: LedgerSnapshot | null;
  storeInfo: { kind: "file" | "memory"; durable: boolean; location: string };
  messages: Record<string, Message>;
}

const FLAGSHIP_REFERENT = "indep_event.launch_date";

export default function ContradictionsPage() {
  const [asOf, setAsOf] = useState(AS_OF_PRESETS[2]!.value);
  const [data, setData] = useState<LedgerApiResponse | null>(null);
  const [cast, setCast] = useState<CastEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceTarget, setSourceTarget] = useState<SourcePanelTarget | null>(null);
  const previousVerdictForFlagship = useRef<Verdict | null | undefined>(undefined);
  const [beforeAfter, setBeforeAfter] = useState<{ from: VerdictKind; to: Verdict } | null>(null);

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

      const flagshipVerdict = json.snapshot?.verdicts.find((v) => v.bucket_key === FLAGSHIP_REFERENT) ?? null;
      const previous = previousVerdictForFlagship.current;
      if (previous !== undefined && previous && flagshipVerdict && previous.verdict !== flagshipVerdict.verdict) {
        setBeforeAfter({ from: previous.verdict, to: flagshipVerdict });
      } else {
        setBeforeAfter(null);
      }
      previousVerdictForFlagship.current = flagshipVerdict;

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
  const messages = data?.messages ?? {};
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

  const flagshipBucket = snapshot?.buckets.find((b) => b.referent === FLAGSHIP_REFERENT);
  const flagshipTitle = flagshipBucket ? conflictTitle(flagshipBucket, flagshipBucket.claims.map((bc) => bc.claim)) : null;

  return (
    <main className="page">
      <h1 className="page-title">Signals</h1>
      <p className="page-subtitle">
        Where your team currently disagrees with itself — surfaced from what people actually said in Slack and
        Gmail, not from a status meeting.
      </p>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "var(--space-3)", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <AsOfControl value={asOf} onChange={handleAsOfChange} />
        {data?.storeInfo && (
          <span className="claim-state-label">
            {data.storeInfo.durable ? "Saved · survives a restart" : "Not saved · resets on restart (demo deployment)"}
          </span>
        )}
      </div>

      {beforeAfter && flagshipTitle && (
        <div className="banner" style={{ borderColor: "var(--settled)" }}>
          <strong>{flagshipTitle}:</strong> the verdict changed between these two points in time — from{" "}
          <VerdictChip verdict={beforeAfter.from} /> to <VerdictChip verdict={beforeAfter.to.verdict} />, decided by{" "}
          {beforeAfter.to.decidedBy === "pre_rule" ? "a deterministic rule (no model call needed)" : "a model call"}.
        </div>
      )}

      {error && <div className="banner banner--warn">Could not load the ledger: {error}</div>}
      {loading && (
        <div aria-live="polite" aria-busy="true">
          <span className="claim-state-label" style={{ display: "block", marginBottom: "var(--space-2)" }}>
            Checking for disagreements...
          </span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="bucket-row-skeleton" aria-hidden="true" />
          ))}
        </div>
      )}

      {!loading && !error && (
        <>
          <h2 className="section-heading">
            {openBuckets.length === 0 ? "Nothing needs your attention" : `Open disagreements (${openBuckets.length})`}
          </h2>
          {openBuckets.length === 0 && (
            <p className="claim-state-label">No open disagreements at this point in time.</p>
          )}
          {openBuckets.map((bucket) => (
            <BucketRow
              key={bucket.referent}
              bucket={bucket}
              verdict={snapshot?.verdicts.find((v) => v.bucket_key === bucket.referent)}
              cast={cast}
              messages={messages}
              onDismiss={dismiss}
              onOpenSource={setSourceTarget}
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
                  messages={messages}
                  onRestore={restore}
                  isDismissed
                  onOpenSource={setSourceTarget}
                />
              ))}
            </>
          )}
        </>
      )}

      <SourcePanel target={sourceTarget} onClose={() => setSourceTarget(null)} />

      <ReviewerNote readmeHref="/architecture#pre-rules">
        <p>
          Each row runs through a deterministic pre-rule ladder (R0–R9) before any model is called — same-asserter
          updates, self-corrections, and authority-based supersession are all decided by code, not by the model.
          Only a bucket with two or more live claims from different people, with no pre-rule able to settle it, gets
          a single binary model call: &ldquo;do these live positions genuinely conflict?&rdquo; If that call
          self-reports low confidence, a confidence-gated escalation router issues a second, richer call — see the
          Architecture page for the live counts. &ldquo;Rewind the ledger&rdquo; re-runs the same deterministic
          pipeline as of an earlier point in time; it does not re-ask the model a new question, it replays the same
          logic against a smaller set of visible messages.
        </p>
      </ReviewerNote>
    </main>
  );
}
