"use client";

import { useEffect, useRef, useCallback } from "react";
import { TraceTable } from "./TraceTable";
import { PromptViewer } from "./DrillDown";
import { VerdictChip } from "./VerdictChip";
import { referentLabel } from "@/lib/display";
import type { Claim, RejectedClaim, TraceEntry, Verdict } from "@/core/types";

export interface PipelineTraceResult {
  claims: Claim[];
  rejectedClaims: RejectedClaim[];
  verdicts: Verdict[];
  trace: TraceEntry[];
}

/**
 * Right-hand slide-over showing every pipeline step for a sandbox run: what
 * was sent to the model and what it produced, in order. Same shell pattern
 * as SourcePanel (scrim, focus trap, Escape-to-close, .source-panel* CSS) —
 * a second instance of the one genuine side-panel pattern this app has,
 * not a new one.
 *
 * Deliberately does NOT claim to show raw model output for a call that
 * succeeded — that text is discarded after parsing everywhere in this
 * pipeline. For a successful call, "what came back" is the structured
 * result the parse actually produced (the claims extracted, or the verdict
 * decided). Raw output is only ever genuinely available for an extraction
 * call that failed schema parsing (RejectedClaim.raw) — shown there and
 * nowhere else.
 */
export function PipelineTracePanel({
  open,
  onClose,
  result,
  onRetryLive,
  retrying = false,
  retryError = null,
}: {
  open: boolean;
  onClose: () => void;
  result: PipelineTraceResult | null;
  /** Undefined when live mode isn't available on this deployment — no retry offered then, since it has nothing to retry with. */
  onRetryLive?: () => void;
  retrying?: boolean;
  /** A failed retry never clears `result` (see sandbox/page.tsx's run()) — this is how that failure surfaces instead. */
  retryError?: { message: string; code?: string } | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, handleClose]);

  if (!open || !result) return null;

  return (
    <>
      <div className="source-panel__scrim" onClick={handleClose} aria-hidden="true" />
      <div ref={panelRef} className="source-panel" role="dialog" aria-modal="true" aria-label="Pipeline trace">
        <div className="source-panel__header">
          <div>
            <div className="claim-state-label">This run, step by step</div>
            <div className="source-panel__title">Pipeline trace</div>
          </div>
          <button ref={closeButtonRef} onClick={handleClose} aria-label="Close" className="source-panel__close">
            ✕
          </button>
        </div>

        <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>
          Every step this run went through, in order — what was sent to the model and what came back. For a call
          that succeeded, &ldquo;got back&rdquo; is the structured result the parse produced (the claims it found, or
          the verdict it decided) — raw model output text is discarded after a successful parse everywhere in this
          pipeline, so it isn&apos;t shown here. The one place raw output genuinely survives is an extraction call
          that failed to parse, shown below.
        </p>

        {retryError && (
          <div className="banner banner--warn" style={{ marginTop: "var(--space-2)" }}>
            Retry failed: {retryError.message}
          </div>
        )}

        <TraceTable entries={result.trace} />

        {result.trace.map((entry) => (
          <TraceStep key={entry.id} entry={entry} result={result} onRetryLive={onRetryLive} retrying={retrying} />
        ))}

        {result.verdicts
          .filter((v) => v.modelCall === null)
          .map((v) => (
            <NoCallVerdictStep key={v.bucket_key} verdict={v} />
          ))}
      </div>
    </>
  );
}

/**
 * A verdict can be decided without ever calling the model — a pre-rule
 * shortcut, the "fewer than 2 live claims" guard, or a caught call
 * failure (pipeline.ts) — and none of those push a TraceEntry, so they
 * have no step in result.trace to render alongside the real adjudicate
 * blocks above. Shown here instead, so the verdict list at the bottom of
 * the panel isn't missing entries the step-by-step view above it skipped.
 */
function NoCallVerdictStep({ verdict }: { verdict: Verdict }) {
  const explanation =
    verdict.decidedBy === "pre_rule"
      ? "Decided by a deterministic pre-rule — no model call was made for this bucket."
      : verdict.rationale.startsWith("model call failed")
        ? "The model call failed, so this fell back to a default verdict."
        : "Not enough live claims from distinct people to adjudicate — decided without a model call.";
  return (
    <div className="drilldown" style={{ marginTop: "var(--space-2)" }}>
      <h3 className="section-heading" style={{ marginTop: 0, fontSize: "var(--size-body)" }}>
        Adjudication — <span className="mono-cell">{verdict.bucket_key}</span>
      </h3>
      <p className="claim-state-label">{explanation}</p>
      <p>
        <VerdictChip verdict={verdict.verdict} /> {verdict.rationale}
      </p>
    </div>
  );
}

function TraceStep({
  entry,
  result,
  onRetryLive,
  retrying,
}: {
  entry: TraceEntry;
  result: PipelineTraceResult;
  onRetryLive?: () => void;
  retrying?: boolean;
}) {
  if (entry.kind === "deterministic" && entry.step.startsWith("noise_gate ")) {
    const messageId = entry.step.replace("noise_gate ", "");
    const gated = entry.detail?.gated === true;
    const rulesFired = Array.isArray(entry.detail?.rulesFired) ? (entry.detail.rulesFired as string[]) : [];
    return (
      <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>
        Noise gate — <span className="mono-cell">{messageId}</span>:{" "}
        {gated ? `gated (${rulesFired.join(", ")})` : "passed"}
      </p>
    );
  }

  if (entry.kind === "model" && entry.step.startsWith("extract ")) {
    const messageId = entry.step.replace("extract ", "");
    const claims = result.claims.filter((c) => c.message_id === messageId);
    const rejections = result.rejectedClaims.filter((r) => r.message_id === messageId);
    // schema_invalid is the truncation signature (see RejectedClaim.raw
    // comment above) — the one case a retry with more room can actually
    // change, since a plain repeat at temperature 0 would just fail the
    // same way again.
    const looksTruncated = !entry.ok || rejections.some((r) => r.reason === "schema_invalid");
    return (
      <div className="drilldown" style={{ marginTop: "var(--space-2)" }}>
        <h3 className="section-heading" style={{ marginTop: 0, fontSize: "var(--size-body)" }}>
          Extraction — <span className="mono-cell">{messageId}</span>
        </h3>
        {entry.promptRef && (
          <>
            <p className="claim-state-label" style={{ marginBottom: "0.3em" }}>
              Sent:
            </p>
            <PromptViewer system={entry.promptRef.system} user={entry.promptRef.user} />
          </>
        )}
        <p className="claim-state-label" style={{ marginTop: "var(--space-2)", marginBottom: "0.3em" }}>
          Got back:
        </p>
        {!entry.ok && (
          <p className="claim-state-label">Call failed — {entry.error ?? "no error detail recorded"}.</p>
        )}
        {entry.ok && claims.length === 0 && rejections.length === 0 && (
          <p className="claim-state-label">No claim in the model&apos;s response for this message.</p>
        )}
        {claims.map((c) => (
          <p key={c.claim_id} style={{ margin: "0.3em 0" }}>
            <strong>{referentLabel(c.referent, [c])}</strong>: &ldquo;{c.value}&rdquo;{" "}
            <span className="claim-state-label">
              ({c.modality}, {c.polarity})
            </span>
          </p>
        ))}
        {rejections.map((r, i) => (
          <div key={i} style={{ margin: "0.3em 0" }}>
            <p className="claim-state-label" style={{ margin: 0 }}>
              Not counted — {r.reason}: {r.detail}
            </p>
            {typeof r.raw === "string" && (
              <pre style={{ marginTop: "0.3em" }}>{r.raw}</pre>
            )}
          </div>
        ))}
        {looksTruncated && onRetryLive && (
          <p style={{ marginTop: "0.5em" }}>
            <button onClick={onRetryLive} disabled={retrying}>
              {retrying ? "Retrying..." : "Retry live, more room to finish →"}
            </button>
            <span className="claim-state-label" style={{ display: "block", marginTop: "0.2em" }}>
              Re-runs the whole submission live with a larger token budget for this attempt only — the committed
              default (800) is unchanged. Doesn&apos;t affect replay mode or the eval baseline.
            </span>
          </p>
        )}
      </div>
    );
  }

  if (entry.kind === "model" && entry.step.startsWith("adjudicate ")) {
    const verdict = result.verdicts.find((v) => v.modelCall?.id === entry.id);
    return (
      <div className="drilldown" style={{ marginTop: "var(--space-2)" }}>
        <h3 className="section-heading" style={{ marginTop: 0, fontSize: "var(--size-body)" }}>
          Adjudication — <span className="mono-cell">{entry.step.replace("adjudicate ", "")}</span>
        </h3>
        {entry.promptRef && (
          <>
            <p className="claim-state-label" style={{ marginBottom: "0.3em" }}>
              Sent:
            </p>
            <PromptViewer system={entry.promptRef.system} user={entry.promptRef.user} />
          </>
        )}
        <p className="claim-state-label" style={{ marginTop: "var(--space-2)", marginBottom: "0.3em" }}>
          Got back:
        </p>
        {!entry.ok && <p className="claim-state-label">Call failed — {entry.error ?? "no error detail recorded"}.</p>}
        {entry.ok && verdict && (
          <p>
            <VerdictChip verdict={verdict.verdict} /> {verdict.rationale}
          </p>
        )}
        {entry.ok && !verdict && <p className="claim-state-label">No matching verdict found for this call.</p>}
      </div>
    );
  }

  return null;
}
