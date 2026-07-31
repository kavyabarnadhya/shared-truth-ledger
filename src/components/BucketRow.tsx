"use client";

import { useState } from "react";
import { VerdictChip } from "./VerdictChip";
import { ClaimTableRow } from "./ClaimRow";
import { PreRuleTrace } from "./DrillDown";
import { formatIST } from "@/lib/format";
import type { Bucket, Verdict, CastEntry } from "@/core/types";

/**
 * A contradiction/bucket is a horizontal row, not a card — click expands in
 * place rather than navigating away. Cards would waste the horizontal space
 * claim comparison needs (design brief).
 */
export function BucketRow({
  bucket,
  verdict,
  cast,
  onDismiss,
  onRestore,
  isDismissed,
}: {
  bucket: Bucket;
  verdict: Verdict | undefined;
  cast: readonly CastEntry[];
  onDismiss?: (bucketKey: string) => void;
  onRestore?: (bucketKey: string) => void;
  isDismissed?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const castByHandle = new Map(cast.map((c) => [c.handle, c]));
  const asserterCount = new Set(bucket.liveClaims.map((c) => c.asserter)).size;

  return (
    <div>
      <button className="bucket-row" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <span className="bucket-row__key">{bucket.referent}</span>
        <span className="bucket-row__meta">
          <span>{asserterCount} asserter{asserterCount === 1 ? "" : "s"}</span>
          <span>{formatIST(bucket.asOf)}</span>
          {verdict && <VerdictChip verdict={verdict.verdict} />}
        </span>
      </button>
      {expanded && (
        <div className="bucket-row__details">
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
              {bucket.claims.map((bc) => {
                const author = castByHandle.get(bc.claim.asserter);
                return (
                  <ClaimTableRow
                    key={bc.claim.claim_id}
                    claim={bc.claim}
                    state={bc.state}
                    authorName={author?.name ?? bc.claim.asserter}
                    authorRole={author?.role ?? ""}
                  />
                );
              })}
            </tbody>
          </table>

          {verdict && (
            <p>
              <strong>Rationale:</strong> {verdict.rationale}
            </p>
          )}

          <PreRuleTrace firings={bucket.preRuleTrace} />

          {(onDismiss || onRestore) && (
            <div style={{ marginTop: "var(--space-2)" }}>
              {isDismissed ? (
                <button onClick={() => onRestore?.(bucket.referent)}>Restore</button>
              ) : (
                <button onClick={() => onDismiss?.(bucket.referent)}>Dismiss</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
