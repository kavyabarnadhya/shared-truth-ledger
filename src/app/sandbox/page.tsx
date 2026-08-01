"use client";

import { useEffect, useState } from "react";
import { SandboxEditor, type SandboxMessageInput } from "@/components/SandboxEditor";
import { HighlightedMessage } from "@/components/ClaimRow";
import { VerdictChip } from "@/components/VerdictChip";
import { ReviewerNote } from "@/components/ReviewerNote";
import { referentLabel } from "@/lib/display";
import type { CastEntry, Claim, Bucket, Verdict } from "@/core/types";

interface SandboxResult {
  claims: Claim[];
  rejectedClaims: Array<{ message_id: string; reason: string; detail: string }>;
  gatedMessageIds: string[];
  buckets: Bucket[];
  verdicts: Verdict[];
  liveModeUsed: boolean;
}

export default function SandboxPage() {
  const [cast, setCast] = useState<CastEntry[]>([]);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [messages, setMessages] = useState<SandboxMessageInput[]>([]);
  const [liveAvailable, setLiveAvailable] = useState(false);
  const [liveUnavailableReason, setLiveUnavailableReason] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cast")
      .then((r) => r.json())
      .then((j) => setCast(j.cast ?? []))
      .catch(() => setCast([]));
    fetch("/api/sandbox")
      .then((r) => r.json())
      .then((j) => {
        setLiveAvailable(!!j.available);
        setLiveUnavailableReason(j.reason ?? null);
      })
      .catch(() => {
        setLiveAvailable(false);
        setLiveUnavailableReason("Could not check live-mode availability.");
      });
  }, []);

  async function run(inputMessages: SandboxMessageInput[], live: boolean) {
    setRunning(true);
    setError(null);
    setMessages(inputMessages);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: inputMessages.filter((m) => m.text.trim()), live }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "replay_miss") {
          const reason = liveAvailable
            ? "This exact text isn't in the recorded set. Try enabling live mode, or use one of the examples below."
            : "This exact text isn't in the recorded set, and live mode is off on this deployment — try one of the examples below.";
          setError({ message: reason, code: json.code });
        } else {
          setError({ message: json.error ?? `request failed (${res.status})`, code: json.code });
        }
        setResult(null);
        return;
      }
      setResult(json);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="page">
      <h1 className="page-title">Try it</h1>
      <p className="page-subtitle">
        Type two messages from different people about the same thing and see what Quorum does with them —
        extraction, then a plain conflict judgment, live.
      </p>

      {cast.length > 0 && (
        <SandboxEditor cast={cast} onRun={run} running={running} liveAvailable={liveAvailable} liveUnavailableReason={liveUnavailableReason} />
      )}

      {error && (
        <div className="banner banner--warn" style={{ marginTop: "var(--space-3)" }}>
          {error.message}
        </div>
      )}

      {result && (
        <>
          <h2 className="section-heading">What it read</h2>
          {result.claims.length === 0 && <p className="claim-state-label">No claims found in either message.</p>}
          {result.claims.map((claim) => {
            const msg = messages.find((_, i) => `SANDBOX-${i}` === claim.message_id);
            return (
              <div key={claim.claim_id} className="drilldown">
                <p>
                  <strong>{referentLabel(claim.referent, [claim])}</strong>: &ldquo;{claim.value}&rdquo;
                </p>
                <span className="claim-state-label">{claim.modality}, {claim.polarity}</span>
                {msg && <HighlightedMessage text={msg.text} claim={claim} />}
              </div>
            );
          })}

          {result.rejectedClaims.length > 0 && (
            <>
              <h2 className="section-heading">Not counted</h2>
              {result.rejectedClaims.map((r, i) => (
                <div key={i} className="claim-state-label">
                  {r.message_id}: {r.reason} — {r.detail}
                </div>
              ))}
            </>
          )}

          <h2 className="section-heading">Verdict</h2>
          {result.buckets.length === 0 && <p className="claim-state-label">Not enough overlapping claims to judge — nothing to compare yet.</p>}
          {result.buckets.map((bucket) => {
            const verdict = result.verdicts.find((v) => v.bucket_key === bucket.referent);
            return (
              <div key={bucket.referent} className="drilldown">
                <strong>{referentLabel(bucket.referent, bucket.claims.map((bc) => bc.claim))}</strong>
                {verdict && (
                  <p>
                    <VerdictChip verdict={verdict.verdict} /> {verdict.rationale}
                  </p>
                )}
              </div>
            );
          })}

          <p className="claim-state-label">{result.liveModeUsed ? "Ran live, against the real model." : "Ran in replay mode, against a committed recording."}</p>
        </>
      )}

      <ReviewerNote readmeHref="/README.md#sandbox">
        <p>
          Every run goes through the same <code>runExtractionPipeline</code>/<code>runAdjudicationPipeline</code>{" "}
          the ledger and Signals pages use — this is not a simplified demo path. In replay mode, novel input that
          doesn&apos;t match a committed recording&apos;s cache key returns a clear &ldquo;no recording for this
          input&rdquo; error rather than a fabricated result (see <code>ReplayMissError</code> in{" "}
          <code>src/core/model/client.ts</code>). Live mode calls the Vercel AI Gateway server-side only — the API
          key never reaches the browser — and is rate-limited to 10 calls per session per 10 minutes, with an
          automatic fallback to replay on a 429.
        </p>
      </ReviewerNote>
    </main>
  );
}
