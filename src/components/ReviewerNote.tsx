"use client";

import Link from "next/link";

/**
 * Two clearly separated layers, per the build plan: the product surfaces
 * read as built for a PM, with zero machine identifiers or eval jargon as
 * primary copy. The engineering depth the assignment actually scores
 * (agents/orchestration, tool calls, context loading, hand-offs, model
 * selection, hooks, MCP integration, eval design) lives here instead —
 * a persistent dismissible banner plus a collapsible per-page note, never
 * blended into the product copy above it.
 */
export function ReviewerBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="reviewer-banner" role="note">
      <span>
        <strong>Reviewer view:</strong> this is an assignment POC. The product above is built for a PM; the
        engineering behind it — agents, tool calls, MCP integration, model selection, evals — is documented at the
        foot of every page and on the{" "}
        <Link href="/architecture" className="reviewer-banner__link">
          Architecture
        </Link>{" "}
        page.
      </span>
      <button onClick={onDismiss} className="reviewer-banner__dismiss" aria-label="Dismiss reviewer banner">
        ✕
      </button>
    </div>
  );
}

/**
 * Collapsible "How this page works (for reviewers)" note at the foot of a
 * page. `children` carries that surface's specific engineering explanation
 * (pre-rules, temporal projection, the eval protocol, etc. — see each page
 * for what it covers); `readmeHref` links to the relevant README section
 * rather than duplicating its content here.
 */
export function ReviewerNote({
  title = "How this page works (for reviewers)",
  readmeHref,
  children,
}: {
  title?: string;
  readmeHref?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="reviewer-note">
      <summary>{title}</summary>
      <div className="reviewer-note__body">
        {children}
        {readmeHref && (
          <p className="claim-state-label">
            Full detail in the README:{" "}
            <a href={readmeHref} target="_blank" rel="noreferrer">
              {readmeHref}
            </a>
          </p>
        )}
      </div>
    </details>
  );
}
