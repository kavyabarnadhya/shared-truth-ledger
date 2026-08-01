"use client";

import { useEffect, useMemo, useState } from "react";
import { TraceTable } from "@/components/TraceTable";
import { SourcePanel, type SourcePanelTarget } from "@/components/SourcePanel";
import { ReviewerNote } from "@/components/ReviewerNote";
import { formatIST, presentClaimState } from "@/lib/format";
import { referentLabel, isCataloguedReferent, sourceMeta } from "@/lib/display";
import type { LedgerSnapshot, CastEntry, Message, Bucket, SourceKind } from "@/core/types";

interface LedgerApiResponse {
  snapshot: LedgerSnapshot | null;
  messages: Record<string, Message>;
}

const ME_HANDLE = "meera.iyer";

/**
 * "What the team believes" — the independently useful Stage 1 view,
 * browsable without any contradiction having been detected. Catalogued
 * referents (real topics from FIXTURE_SPEC.md/GOLD_LABELS.md) are shown as
 * the primary list; extractor-minted noise is collapsed under its own
 * honestly-labelled section rather than presented as an equally curated
 * topic. Filterable by source, channel/subject, and person — all derived
 * from the real Message records the ledger's claims point at.
 */
export default function LedgerPage() {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [messages, setMessages] = useState<Record<string, Message>>({});
  const [cast, setCast] = useState<CastEntry[]>([]);
  const [textFilter, setTextFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceKind | "">("");
  const [personFilter, setPersonFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [sourceTarget, setSourceTarget] = useState<SourcePanelTarget | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/ledger").then((r) => r.json()),
      fetch("/api/cast").then((r) => r.json()),
    ])
      .then(([ledgerJson, castJson]: [LedgerApiResponse, { cast: CastEntry[] }]) => {
        setSnapshot(ledgerJson.snapshot ?? null);
        setMessages(ledgerJson.messages ?? {});
        setCast(castJson.cast ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const castByHandle = useMemo(() => new Map(cast.map((c) => [c.handle, c])), [cast]);

  const bucketMessageSources = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const b of snapshot?.buckets ?? []) {
      const srcs = new Set<string>();
      for (const bc of b.claims) {
        const m = messages[bc.claim.message_id];
        if (m) srcs.add(m.source);
      }
      map.set(b.referent, srcs);
    }
    return map;
  }, [snapshot, messages]);

  function bucketMatchesFilters(b: Bucket): boolean {
    if (textFilter.trim() && !referentLabel(b.referent, b.claims.map((bc) => bc.claim)).toLowerCase().includes(textFilter.toLowerCase()) && !b.referent.toLowerCase().includes(textFilter.toLowerCase())) {
      return false;
    }
    if (sourceFilter && !bucketMessageSources.get(b.referent)?.has(sourceFilter)) return false;
    if (personFilter && !b.claims.some((bc) => bc.claim.asserter === personFilter)) return false;
    return true;
  }

  const allBuckets = (snapshot?.buckets ?? []).filter(bucketMatchesFilters);
  const cataloguedBuckets = allBuckets.filter((b) => isCataloguedReferent(b.referent));
  const noiseBuckets = allBuckets.filter((b) => !isCataloguedReferent(b.referent));

  return (
    <main className="page">
      <h1 className="page-title">What the team believes</h1>
      <p className="page-subtitle">
        Every topic Quorum is tracking, the current position, who holds it, and how it got there — independently
        useful even when nothing is in dispute.
      </p>

      {loading && <p className="claim-state-label">Loading...</p>}

      {!loading && !snapshot && (
        <div className="banner">
          No ledger built yet. Visit the Signals tab first to build one, then return here.
        </div>
      )}

      {snapshot && (
        <>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
            <input
              type="text"
              placeholder="Search topics..."
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              style={{ flex: "1 1 240px", padding: "var(--space-1)" }}
            />
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceKind | "")}>
              <option value="">All sources</option>
              <option value="slack">Slack</option>
              <option value="gmail">Gmail</option>
            </select>
            <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
              <option value="">Everyone</option>
              {cast.filter((c) => !c.is_bot).map((c) => (
                <option key={c.handle} value={c.handle}>
                  {c.handle === ME_HANDLE ? "You (Meera Iyer)" : c.name}
                </option>
              ))}
            </select>
          </div>

          <p className="claim-state-label">
            {cataloguedBuckets.length} topic{cataloguedBuckets.length === 1 ? "" : "s"} as of {formatIST(snapshot.asOf)}
          </p>

          {cataloguedBuckets.map((bucket) => (
            <LedgerBucketRow key={bucket.referent} bucket={bucket} castByHandle={castByHandle} messages={messages} onOpenSource={setSourceTarget} />
          ))}

          {noiseBuckets.length > 0 && (
            <details className="drilldown" style={{ marginTop: "var(--space-3)" }}>
              <summary>Other topics detected automatically ({noiseBuckets.length})</summary>
              <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>
                The free extraction model sometimes over-segments a single real topic into several near-duplicate
                keys (e.g. &ldquo;15th&rdquo; as its own topic alongside the launch date it&apos;s part of). These
                are shown honestly rather than hidden, but kept separate from the catalogued topics above.
              </p>
              {noiseBuckets.map((bucket) => (
                <LedgerBucketRow key={bucket.referent} bucket={bucket} castByHandle={castByHandle} messages={messages} onOpenSource={setSourceTarget} />
              ))}
            </details>
          )}

          <ReviewerNote readmeHref="/README.md#ledger">
            <p>
              Each row is a temporal projection over that referent&apos;s claims as of the ledger&apos;s frozen as-of
              (see <code>src/core/ledger.ts</code>): superseded/withdrawn claims stay visible, not hidden, so a
              reviewer can see what was ruled out and why. The watermark (<code>snapshot.watermark</code>) tracks
              which messages have already been processed, making re-runs idempotent. Suppression (dismiss/restore on
              the Signals tab) re-raises a bucket only if its live claim set actually changes — a dismissal isn&apos;t
              silently permanent.
            </p>
            <h4 style={{ margin: "var(--space-2) 0 0.3em 0", fontSize: "var(--size-caption)" }}>Full pipeline trace</h4>
            <TraceTable entries={snapshot.trace} />
          </ReviewerNote>
        </>
      )}

      <SourcePanel target={sourceTarget} onClose={() => setSourceTarget(null)} />
    </main>
  );
}

function LedgerBucketRow({
  bucket,
  castByHandle,
  messages,
  onOpenSource,
}: {
  bucket: Bucket;
  castByHandle: Map<string, CastEntry>;
  messages: Record<string, Message>;
  onOpenSource: (target: SourcePanelTarget) => void;
}) {
  const liveClaims = bucket.claims.filter((bc) => bc.state === "live");
  const label = referentLabel(bucket.referent, bucket.claims.map((bc) => bc.claim));
  const lastChanged = [...bucket.claims].sort((a, b) => (a.claim.timestamp < b.claim.timestamp ? 1 : -1))[0]?.claim.timestamp;
  const supportCount = bucket.claims.length;

  return (
    <details className="drilldown" style={{ marginBottom: "var(--space-2)" }}>
      <summary>
        <strong>{label}</strong>
        <span className="claim-state-label" style={{ marginLeft: "var(--space-2)" }}>
          {bucket.referent}
        </span>
      </summary>

      <p>
        <strong>Current position:</strong>{" "}
        {liveClaims.length === 0
          ? "no current position"
          : liveClaims
              .map((bc) => {
                const person = bc.claim.asserter === ME_HANDLE ? "You" : castByHandle.get(bc.claim.asserter)?.name ?? bc.claim.asserter;
                return `${bc.claim.value} (${person})`;
              })
              .join("; ")}
      </p>
      <p className="claim-state-label">
        {lastChanged && <>Last changed {formatIST(lastChanged)} · </>}
        {supportCount} message{supportCount === 1 ? "" : "s"} in this history
      </p>

      <table className="claim-table">
        <thead>
          <tr>
            <th>Who</th>
            <th>When</th>
            <th>Said</th>
            <th>Status</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {[...bucket.claims]
            .sort((a, b) => (a.claim.timestamp < b.claim.timestamp ? -1 : 1))
            .map((bc) => {
              const message = messages[bc.claim.message_id];
              const meta = message ? sourceMeta(message) : null;
              const person = bc.claim.asserter === ME_HANDLE ? "You" : castByHandle.get(bc.claim.asserter)?.name ?? bc.claim.asserter;
              return (
                <tr key={bc.claim.claim_id}>
                  <td>{person}</td>
                  <td className="mono-cell">{formatIST(bc.claim.timestamp)}</td>
                  <td>{bc.claim.value}</td>
                  <td className="claim-state-label">{presentClaimState(bc.state)}</td>
                  <td>
                    {message ? (
                      <button
                        className="claim-side__source-link"
                        onClick={() => onOpenSource({ thread_id: message.thread_id, claim: bc.claim })}
                      >
                        {meta?.kind} · {meta?.location} →
                      </button>
                    ) : (
                      <span className="claim-state-label">unavailable</span>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </details>
  );
}
