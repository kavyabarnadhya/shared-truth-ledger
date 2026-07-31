"use client";

import { useEffect, useState } from "react";
import { SandboxEditor, type SandboxMessageInput } from "@/components/SandboxEditor";
import { HighlightedMessage } from "@/components/ClaimRow";
import { VerdictChip } from "@/components/VerdictChip";
import { PreRuleTrace } from "@/components/DrillDown";
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
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<SandboxMessageInput[]>([]);

  useEffect(() => {
    fetch("/api/cast")
      .then((r) => r.json())
      .then((j) => setCast(j.cast ?? []))
      .catch(() => setCast([]));
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
        setError(json.error ?? `request failed (${res.status})`);
        setResult(null);
        return;
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="page">
      <h1 className="page-title">Sandbox</h1>
      <p className="page-subtitle">
        Type or edit up to two messages and run extraction + adjudication on them directly. In replay mode, novel text
        that doesn&apos;t match a committed recording will say so rather than fabricate a result.
      </p>

      {cast.length > 0 && <SandboxEditor cast={cast} onRun={run} running={running} />}

      {error && (
        <div className="banner banner--warn" style={{ marginTop: "var(--space-3)" }}>
          {error}
        </div>
      )}

      {result && (
        <>
          <h2 className="section-heading">Extracted claims</h2>
          {result.claims.length === 0 && <p className="claim-state-label">No claims extracted.</p>}
          {result.claims.map((claim) => {
            const msg = messages.find((_, i) => `SANDBOX-${i}` === claim.message_id);
            return (
              <div key={claim.claim_id} className="drilldown">
                <div className="mono-cell">{claim.claim_id}</div>
                <p>
                  <strong>{claim.referent}</strong>: {claim.value} ({claim.modality}, {claim.polarity})
                </p>
                {msg && <HighlightedMessage text={msg.text} claim={claim} />}
              </div>
            );
          })}

          {result.rejectedClaims.length > 0 && (
            <>
              <h2 className="section-heading">Rejected</h2>
              {result.rejectedClaims.map((r, i) => (
                <div key={i} className="claim-state-label">
                  {r.message_id}: {r.reason} — {r.detail}
                </div>
              ))}
            </>
          )}

          <h2 className="section-heading">Adjudication</h2>
          {result.buckets.length === 0 && <p className="claim-state-label">No bucket had two or more live claims to adjudicate.</p>}
          {result.buckets.map((bucket) => {
            const verdict = result.verdicts.find((v) => v.bucket_key === bucket.referent);
            return (
              <div key={bucket.referent} className="drilldown">
                <div className="mono-cell">{bucket.referent}</div>
                {verdict && (
                  <p>
                    <VerdictChip verdict={verdict.verdict} /> {verdict.rationale}
                  </p>
                )}
                <PreRuleTrace firings={bucket.preRuleTrace} />
              </div>
            );
          })}

          <p className="claim-state-label">{result.liveModeUsed ? "Ran live." : "Ran in replay mode."}</p>
        </>
      )}
    </main>
  );
}
