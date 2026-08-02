"use client";

import { useState } from "react";
import { VerdictChip } from "./VerdictChip";
import { formatIST } from "@/lib/format";
import { conflictTitle, claimStateLabel, sourceMeta, isCataloguedReferent } from "@/lib/display";
import type { SourcePanelTarget } from "./SourcePanel";
import type { Bucket, Verdict, CastEntry, Claim, Message, Resolution } from "@/core/types";

const ME_HANDLE = "meera.iyer";

const RULE_EXPLANATIONS: Record<string, string> = {
  R1_reported_speech_exclusion: "Someone was relaying what another person said, not making the claim themselves — excluded.",
  R1b_non_claim_exclusion: "That message was a hedge, a proposal, or a question, not a first-party statement — excluded.",
  R2_same_asserter_update: "The same person said something different later — their earlier message no longer counts as their position.",
  R3_negative_polarity_guard: "Someone explicitly said what it is NOT — checked against what they'd already said elsewhere.",
  R4_self_correction: "Someone corrected themselves to match what someone else had already said — treated as a correction, not an open conflict.",
  R5_authoritative_supersession: "The most senior person in the thread made the final call, overriding the earlier disagreement.",
  R6_single_live_claim: "Only one current position remains — nothing to disagree about.",
  R6b_live_claims_agree: "More than one person has a current position, but they all agree on the same answer.",
  R7_zero_live_claims: "No current position remains at all — nothing to disagree about.",
  R8_contested_marker: "This one is genuinely arguable both ways — kept separate rather than scored as right or wrong.",
};

function explainRule(rule: string): string {
  return RULE_EXPLANATIONS[rule] ?? rule;
}

/**
 * A conflict is a horizontal row, not a card — click expands in place. The
 * headline is the plain-English conflict statement (conflictTitle); the
 * machine key is demoted to a small mono caption underneath. Both sides of
 * the disagreement show who said it, their role, where, when, and the
 * actual message text with the asserted phrase highlighted — clicking opens
 * the SourcePanel onto the real thread. Meera's own claims are framed as
 * "You" rather than by name, matching how she'd read her own words.
 */
export function BucketRow({
  bucket,
  verdict,
  cast,
  messages,
  onDismiss,
  onRestore,
  isDismissed,
  onResolve,
  onClearResolution,
  resolution,
  onOpenSource,
}: {
  bucket: Bucket;
  verdict: Verdict | undefined;
  cast: readonly CastEntry[];
  messages: Record<string, Message>;
  onDismiss?: (bucketKey: string) => void;
  onRestore?: (bucketKey: string) => void;
  isDismissed?: boolean;
  onResolve?: (bucketKey: string, winningAsserter: string | null, note: string | null) => void;
  onClearResolution?: (bucketKey: string) => void;
  resolution?: Resolution | null;
  onOpenSource: (target: SourcePanelTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [winningAsserter, setWinningAsserter] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const castByHandle = new Map(cast.map((c) => [c.handle, c]));
  const liveClaims = bucket.liveClaims;
  const asserterCount = new Set(liveClaims.map((c) => c.asserter)).size;
  const title = conflictTitle(bucket, bucket.claims.map((bc) => bc.claim));
  const catalogued = isCataloguedReferent(bucket.referent);

  // Chronological story: every claim in this bucket in time order, whether
  // live, superseded, or excluded — the full arc, not just the survivors.
  const story = [...bucket.claims].sort((a, b) => (a.claim.timestamp < b.claim.timestamp ? -1 : 1));

  return (
    <div>
      <button className="bucket-row" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <span className="bucket-row__title-block">
          <span className="bucket-row__headline">{title}</span>
          {!catalogued && <span className="bucket-row__noise-tag">auto-detected</span>}
          <span className="bucket-row__key">{bucket.referent}</span>
        </span>
        <span className="bucket-row__meta">
          <span>{asserterCount} {asserterCount === 1 ? "person" : "people"} involved</span>
          <span>{formatIST(bucket.asOf)}</span>
          {verdict && <VerdictChip verdict={verdict.verdict} />}
        </span>
      </button>
      {expanded && (
        <div className="bucket-row__details">
          <h3 className="section-heading" style={{ marginTop: 0 }}>Who&apos;s saying what</h3>
          <div className="claim-compare">
            {liveClaims.map((claim) => (
              <ClaimSide
                key={claim.claim_id}
                claim={claim}
                castByHandle={castByHandle}
                message={messages[claim.message_id]}
                onOpenSource={onOpenSource}
              />
            ))}
            {liveClaims.length === 0 && <p className="claim-state-label">No current position on either side — this has settled.</p>}
          </div>

          {verdict && (
            <p style={{ marginTop: "var(--space-2)" }}>
              <strong>What the system concluded:</strong> {verdict.rationale}
            </p>
          )}

          <details className="drilldown">
            <summary>Why was this flagged?</summary>
            <div style={{ marginTop: "var(--space-2)" }}>
              {bucket.preRuleTrace.length === 0 ? (
                <p className="claim-state-label">
                  No automatic rule settled this on its own — it went to a model call to judge whether the live
                  positions genuinely conflict.
                </p>
              ) : (
                <ul className="prerule-list">
                  {bucket.preRuleTrace.map((f, i) => (
                    <li key={i}>{explainRule(f.rule)}</li>
                  ))}
                </ul>
              )}
              {verdict?.decidedBy === "model" && (
                <p className="claim-state-label">
                  Model rationale: {verdict.rationale}
                </p>
              )}
            </div>
          </details>

          <h3 className="section-heading">Story so far</h3>
          <ol className="story-timeline">
            {story.map((bc) => (
              <StoryEntry key={bc.claim.claim_id} bucketClaim={bc} castByHandle={castByHandle} message={messages[bc.claim.message_id]} onOpenSource={onOpenSource} />
            ))}
          </ol>

          {resolution && (
            <div className="banner" style={{ borderColor: "var(--settled)", marginTop: "var(--space-2)" }}>
              <strong>Marked resolved</strong> by {resolution.resolvedBy === ME_HANDLE ? "you" : resolution.resolvedBy}
              {resolution.winningAsserter && (
                <> — {personLabel(resolution.winningAsserter, castByHandle).name}&apos;s position stands</>
              )}
              {resolution.note && <>: &ldquo;{resolution.note}&rdquo;</>}
              {onClearResolution && (
                <>
                  {" "}
                  <button className="claim-side__source-link" onClick={() => onClearResolution(bucket.referent)}>
                    Clear
                  </button>
                </>
              )}
            </div>
          )}

          {(onDismiss || onRestore || onResolve) && (
            <div style={{ marginTop: "var(--space-2)" }}>
              {isDismissed ? (
                <>
                  <p className="claim-state-label" style={{ marginBottom: "0.3em" }}>
                    Dismissed — hidden from the open list. It reappears automatically if either side&apos;s live
                    position changes; otherwise it stays here until you restore it.
                  </p>
                  <button onClick={() => onRestore?.(bucket.referent)}>Restore</button>
                </>
              ) : (
                <>
                  <p className="claim-state-label" style={{ marginBottom: "0.3em" }}>
                    <strong>Dismiss</strong> hides this from the open list without deciding it — it&apos;s reversible
                    (see &ldquo;Dismissed&rdquo; below) and re-raises automatically the moment either side&apos;s
                    live position actually changes, so dismissing never silences a real update.
                  </p>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    {onDismiss && <button onClick={() => onDismiss(bucket.referent)}>Dismiss</button>}
                    {onResolve && !resolution && (
                      <button onClick={() => setResolving((v) => !v)}>
                        {resolving ? "Cancel" : "Mark as resolved"}
                      </button>
                    )}
                  </div>
                </>
              )}

              {resolving && onResolve && (
                <div className="drilldown" style={{ marginTop: "var(--space-2)" }}>
                  <p className="claim-state-label" style={{ marginTop: 0 }}>
                    Record which position won and by whom — for cases the automatic rules couldn&apos;t settle on
                    their own. This is a manual note alongside the system&apos;s verdict, not a replacement for it;
                    it&apos;s saved the same way a dismissal is (survives a restart) and reverses the same way, too.
                  </p>
                  {liveClaims.length > 0 && (
                    <label style={{ display: "block", marginBottom: "var(--space-1)" }}>
                      <span className="claim-state-label">Whose position won (optional)</span>
                      <select
                        value={winningAsserter}
                        onChange={(e) => setWinningAsserter(e.target.value)}
                        style={{ display: "block", marginTop: "0.2em" }}
                      >
                        <option value="">Not applicable / decided some other way</option>
                        {liveClaims.map((c) => (
                          <option key={c.asserter} value={c.asserter}>
                            {personLabel(c.asserter, castByHandle).name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label style={{ display: "block", marginBottom: "var(--space-1)" }}>
                    <span className="claim-state-label">Note (optional)</span>
                    <input
                      type="text"
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      placeholder="e.g. confirmed 15 August in standup"
                      style={{ display: "block", marginTop: "0.2em", width: "100%", maxWidth: "28em" }}
                    />
                  </label>
                  <button
                    onClick={() => {
                      onResolve(bucket.referent, winningAsserter || null, resolutionNote.trim() || null);
                      setResolving(false);
                    }}
                  >
                    Save resolution
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function personLabel(handle: string, castByHandle: Map<string, CastEntry>): { name: string; role: string; isMe: boolean } {
  if (handle === ME_HANDLE) {
    const entry = castByHandle.get(handle);
    return { name: "You", role: entry?.role ?? "Product Manager", isMe: true };
  }
  const entry = castByHandle.get(handle);
  return { name: entry?.name ?? handle, role: entry?.role ?? "", isMe: false };
}

function ClaimSide({
  claim,
  castByHandle,
  message,
  onOpenSource,
}: {
  claim: Claim;
  castByHandle: Map<string, CastEntry>;
  message: Message | undefined;
  onOpenSource: (target: SourcePanelTarget) => void;
}) {
  const person = personLabel(claim.asserter, castByHandle);
  const meta = message ? sourceMeta(message) : null;

  return (
    <div className="claim-side">
      <div className="claim-side__person">
        <strong>{person.name}</strong>
        <span className="claim-state-label">{person.role}</span>
      </div>
      <div className="claim-state-label">
        {meta ? `${meta.kind} · ${meta.location}` : "source unavailable"} · {formatIST(claim.timestamp)}
      </div>
      <p className="claim-side__value">&ldquo;{claim.value}&rdquo;</p>
      <button
        className="claim-side__source-link"
        onClick={() => message && onOpenSource({ thread_id: message.thread_id, claim })}
        disabled={!message}
      >
        View the message →
      </button>
    </div>
  );
}

function StoryEntry({
  bucketClaim,
  castByHandle,
  message,
  onOpenSource,
}: {
  bucketClaim: Bucket["claims"][number];
  castByHandle: Map<string, CastEntry>;
  message: Message | undefined;
  onOpenSource: (target: SourcePanelTarget) => void;
}) {
  const { claim, state, stateReason } = bucketClaim;
  const person = personLabel(claim.asserter, castByHandle);
  const meta = message ? sourceMeta(message) : null;

  return (
    <li className="story-entry">
      <div className="claim-state-label">{formatIST(claim.timestamp)}</div>
      <div>
        <strong>{person.name}</strong> ({person.role}){meta && <> — {meta.kind} · {meta.location}</>}
      </div>
      <p className="story-entry__text">&ldquo;{claim.value}&rdquo;</p>
      <div className="claim-state-label">{claimStateLabel(state)} — {stateReason}</div>
      <button
        className="claim-side__source-link"
        onClick={() => message && onOpenSource({ thread_id: message.thread_id, claim })}
        disabled={!message}
      >
        View the message →
      </button>
    </li>
  );
}
