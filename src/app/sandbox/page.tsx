"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SandboxEditor, type SandboxMessageInput } from "@/components/SandboxEditor";
import { HighlightedMessage } from "@/components/ClaimRow";
import { VerdictChip } from "@/components/VerdictChip";
import { ReviewerNote } from "@/components/ReviewerNote";
import { PipelineTracePanel } from "@/components/PipelineTracePanel";
import { referentLabel } from "@/lib/display";
import type { CastEntry, Claim, Bucket, Verdict, RejectedClaim, TraceEntry } from "@/core/types";

/**
 * Live calls run at temperature 0 (config.ts), so a plain retry with the
 * same request would just reproduce the same truncation — this is
 * double the committed default (800), used only when the user explicitly
 * asks for a retry, never on a normal run.
 */
const RETRY_MAX_OUTPUT_TOKENS = 1600;

interface SandboxResult {
  claims: Claim[];
  rejectedClaims: RejectedClaim[];
  gatedMessageIds: string[];
  buckets: Bucket[];
  verdicts: Verdict[];
  trace: TraceEntry[];
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
  const [tracePanelOpen, setTracePanelOpen] = useState(false);
  // Separate from `error`: a failed retry must not clear the result the
  // panel is showing (see run()'s isRetry branch) — surfaced inline in the
  // panel instead of the page-level banner, which would be hidden behind
  // the panel's scrim anyway.
  const [retryError, setRetryError] = useState<{ message: string; code?: string } | null>(null);

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

  async function run(inputMessages: SandboxMessageInput[], live: boolean, maxOutputTokens?: number, isRetry = false) {
    setRunning(true);
    if (isRetry) {
      setRetryError(null);
    } else {
      setError(null);
      setMessages(inputMessages);
    }
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: inputMessages.filter((m) => m.text.trim()), live, maxOutputTokens }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "replay_miss") {
          const reason = liveAvailable
            ? "This exact text isn't in the recorded set. Try enabling live mode, or use one of the examples below."
            : "This exact text isn't in the recorded set, and live mode is off on this deployment — try one of the examples below.";
          if (isRetry) {
            // A failed retry keeps the original result and panel intact —
            // it has more to lose (the trace data the user opened the panel
            // to inspect) than a first run does, and a fallback-to-replay
            // after a bumped-token live call will almost always miss (the
            // recording is keyed at the default 800), so this is the
            // expected shape of a retry failure, not an edge case.
            setRetryError({ message: reason, code: json.code });
          } else {
            setError({ message: reason, code: json.code });
            setResult(null);
          }
        } else if (isRetry) {
          setRetryError({ message: json.error ?? `request failed (${res.status})`, code: json.code });
        } else {
          setError({ message: json.error ?? `request failed (${res.status})`, code: json.code });
          setResult(null);
        }
        return;
      }
      setResult(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isRetry) {
        setRetryError({ message });
      } else {
        setError({ message });
      }
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
      <p className="claim-state-label" style={{ marginBottom: "var(--space-2)" }}>
        Runs the exact same pipeline shown on <Link href="/architecture">Architecture</Link> — noise gate,
        extraction, referent resolution, pre-rules, adjudication — not a simplified stand-in for it.
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
          <p style={{ marginTop: "var(--space-2)" }}>
            <button onClick={() => setTracePanelOpen(true)}>See what happened, step by step →</button>
          </p>

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

      <ReviewerNote readmeHref="/architecture#sandbox">
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

      <PipelineTracePanel
        open={tracePanelOpen}
        onClose={() => setTracePanelOpen(false)}
        result={result}
        onRetryLive={liveAvailable ? () => run(messages, true, RETRY_MAX_OUTPUT_TOKENS, true) : undefined}
        retrying={running}
        retryError={retryError}
      />
    </main>
  );
}
