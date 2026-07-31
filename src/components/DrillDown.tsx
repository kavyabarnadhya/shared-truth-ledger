"use client";

import type { PreRuleFiring } from "@/core/types";

/**
 * "View prompt" affordance: system prompt, output schema, which deterministic
 * pre-rules fired before the model was called. Every drill-down in the app
 * exposes this — it's what proves the two-tier cascade and the pre-rule
 * ladder are real rather than asserted.
 */
export function PromptViewer({ system, user }: { system: string; user: string }) {
  return (
    <details className="drilldown">
      <summary>view prompt</summary>
      <div className="section-heading" style={{ fontSize: "var(--size-caption)", marginTop: "var(--space-2)" }}>
        System
      </div>
      <pre>{system}</pre>
      <div className="section-heading" style={{ fontSize: "var(--size-caption)" }}>
        User
      </div>
      <pre>{user}</pre>
    </details>
  );
}

export function PreRuleTrace({ firings }: { firings: PreRuleFiring[] }) {
  if (firings.length === 0) {
    return <p className="claim-state-label">No deterministic pre-rule fired for this bucket.</p>;
  }
  return (
    <details className="drilldown">
      <summary>pre-rules fired ({firings.length})</summary>
      <ol className="prerule-list">
        {firings.map((f, i) => (
          <li key={i}>
            <span className="mono-cell">{f.rule}</span> — {f.effect}
            {f.decidesVerdict && (
              <>
                {" "}
                → decides <span className="mono-cell">{f.decidesVerdict}</span>
              </>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
