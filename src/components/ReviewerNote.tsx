"use client";

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
