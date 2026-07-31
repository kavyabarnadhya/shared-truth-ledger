"use client";

import { formatIST, presentClaimState } from "@/lib/format";
import type { Claim, ClaimState } from "@/core/types";

/**
 * Renders a message's text with the claim's `source_span` highlighted at
 * `span_offset` — the ONLY saturated colour in the interface. This is the
 * signature element: it is visible proof the anti-hallucination span check
 * is real, not claimed. When a claim's span was rejected (span_valid ===
 * false), no highlight is shown and a plain "span not found in source"
 * label appears instead, so the absence is as legible as the presence.
 */
export function HighlightedMessage({ text, claim }: { text: string; claim: Claim }) {
  if (!claim.span_valid || claim.span_offset === null) {
    return (
      <div className="message-text">
        {text}
        <div className="span-not-found">span not found in source</div>
      </div>
    );
  }

  const start = claim.span_offset;
  const end = start + claim.source_span.length;
  const before = text.slice(0, start);
  const span = text.slice(start, end);
  const after = text.slice(end);

  return (
    <div className="message-text">
      {before}
      <mark className="span-highlight">{span}</mark>
      {after}
    </div>
  );
}

export function ClaimStateLabel({ state }: { state: ClaimState }) {
  return <span className="claim-state-label">{presentClaimState(state)}</span>;
}

/**
 * A single claim's row in the two-column claim comparison table: asserter,
 * role, timestamp, value, span. Superseded/withdrawn claims stay visible and
 * legible (never implied by opacity alone) — a reviewer needs to see what
 * was ruled out, not just what survived.
 */
export function ClaimTableRow({
  claim,
  state,
  authorName,
  authorRole,
}: {
  claim: Claim;
  state: ClaimState;
  authorName: string;
  authorRole: string;
}) {
  return (
    <tr>
      <td>
        {authorName}
        <div className="claim-state-label">{authorRole}</div>
      </td>
      <td className="mono-cell">{formatIST(claim.timestamp)}</td>
      <td>{claim.value}</td>
      <td>
        <ClaimStateLabel state={state} />
      </td>
      <td className="mono-cell">{claim.claim_id}</td>
    </tr>
  );
}
