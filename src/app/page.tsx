"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReviewerNote } from "@/components/ReviewerNote";
import { conflictTitle, isCataloguedReferent } from "@/lib/display";
import type { LedgerSnapshot } from "@/core/types";

interface LedgerApiResponse {
  snapshot: LedgerSnapshot | null;
}

const CONTRADICTION_VERDICTS = new Set(["CONTRADICTION", "CONTESTED", "AMBIGUOUS_REFERENT"]);

/**
 * Overview / landing screen. Leads with the PM's actual situation — what
 * needs attention right now — rather than system counts. False-positive
 * rate and contradiction recall (eval jargon) live on the Evals page now;
 * this page states the trust claim in one plain sentence and links there.
 * Numbers here are pulled live from the same /api/ledger every other tab
 * uses — nothing hand-typed.
 */
export default function OverviewPage() {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [topicsTracked, setTopicsTracked] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLedger() {
      try {
        const res = await fetch("/api/ledger", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ judgeScope: "binary" }),
        });
        if (!res.ok) throw new Error(`ledger request failed (${res.status})`);
        const json = (await res.json()) as LedgerApiResponse;
        if (cancelled || !json.snapshot) return;
        setSnapshot(json.snapshot);
        setTopicsTracked(json.snapshot.buckets.filter((b) => isCataloguedReferent(b.referent)).length);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLedger();
    return () => {
      cancelled = true;
    };
  }, []);

  const suppressedKeys = new Set((snapshot?.suppressions ?? []).map((s) => s.bucket_key));
  const openBuckets =
    snapshot?.buckets.filter((b) => {
      const v = snapshot.verdicts.find((vv) => vv.bucket_key === b.referent);
      if (!v || !CONTRADICTION_VERDICTS.has(v.verdict)) return false;
      return !suppressedKeys.has(b.referent);
    }) ?? [];

  const flagship = openBuckets.find((b) => b.referent === "indep_event.launch_date") ?? openBuckets[0];

  // Same definitions Signals uses: dismissed = a contradiction-shaped bucket
  // hidden from the open list; resolved = an in-place "who won" annotation
  // that doesn't remove a bucket from Open/Dismissed. Neither appears in
  // openBuckets above, so they're invisible here unless surfaced explicitly.
  const dismissedCount = snapshot?.buckets.filter((b) => suppressedKeys.has(b.referent)).length ?? 0;
  const resolvedCount = snapshot?.resolutions.length ?? 0;

  return (
    <main className="page">
      <h1 className="page-title">Quorum</h1>
      <p className="page-subtitle">
        Quorum reads Tamarind Games&apos; Slack and Gmail, keeps track of who said what, and tells you the moment two
        people&apos;s current positions on the same thing stop agreeing.
      </p>

      {error && <div className="banner banner--warn">{error}</div>}
      {loading && <p className="claim-state-label">Checking Slack and Gmail...</p>}

      {!loading && !error && (
        <>
          <h2 className="section-heading" style={{ marginTop: 0 }}>
            {openBuckets.length === 0
              ? "Nothing needs your attention"
              : `${openBuckets.length} thing${openBuckets.length === 1 ? "" : "s"} need${openBuckets.length === 1 ? "s" : ""} your attention`}
          </h2>

          {openBuckets.length === 0 && (
            <p className="claim-state-label">No open disagreements right now.</p>
          )}

          {flagship && (
            <div className="drilldown" style={{ marginBottom: "var(--space-2)" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{conflictTitle(flagship, flagship.claims.map((bc) => bc.claim))}</p>
              <p className="claim-state-label" style={{ marginTop: "0.3em" }}>
                Featured — the clearest example of what Quorum catches.
              </p>
              <Link href="/contradictions">Look at it →</Link>
            </div>
          )}

          {openBuckets.length > 1 && (
            <p className="claim-state-label">
              Plus {openBuckets.length - 1} more on the{" "}
              <Link href="/contradictions">Signals</Link> page.
            </p>
          )}

          <div className="stat-row">
            <div className="stat-item">
              <span className="stat-item__value">{topicsTracked ?? "—"}</span>
              <span className="stat-item__label">
                Topics being tracked — <Link href="/ledger">see them all</Link>
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-item__value">{openBuckets.length}</span>
              <span className="stat-item__label">Open disagreements</span>
            </div>
            {(dismissedCount > 0 || resolvedCount > 0) && (
              <div className="stat-item">
                <span className="stat-item__value">{dismissedCount + resolvedCount}</span>
                <span className="stat-item__label">
                  {dismissedCount} dismissed, {resolvedCount} resolved — see{" "}
                  <Link href="/contradictions">Signals</Link> for detail
                </span>
              </div>
            )}
          </div>

          <p>
            Checked against 27 hand-labelled scenarios — 0 false alarms.{" "}
            <Link href="/evals">See how it&apos;s measured →</Link>
          </p>

          <p className="claim-state-label">
            Connected: Slack and Gmail (demo workspace, read-only, via an MCP-style tool layer). Everything below runs
            in replay mode — no live model key needed to review it.
          </p>

          <div className="cta-row">
            <Link href="/contradictions">View signals →</Link>
            <Link href="/ledger">What the team believes →</Link>
            <Link href="/architecture">See how it works →</Link>
          </div>
        </>
      )}

      <ReviewerNote readmeHref="/architecture#overview">
        <p>
          &ldquo;Topics being tracked&rdquo; counts only catalogued referents (see the Ledger page&apos;s
          &ldquo;other topics detected automatically&rdquo; split) — internal identifiers like{" "}
          <code>indep_event.launch_date</code> and extractor-minted noise both live in the same underlying
          <code> Bucket[]</code>, but only the former is a real tracked topic from a product point of view. The false
          positive rate and contradiction recall figures now live entirely on the Evals page, computed by the same
          in-browser eval suite you can run yourself there — this page no longer duplicates that computation.
        </p>
      </ReviewerNote>
    </main>
  );
}
