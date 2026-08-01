"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { formatIST } from "@/lib/format";
import type { Claim, Message, Thread } from "@/core/types";

interface WorkspaceThreadResponse {
  tool: string;
  servedBy: string;
  thread: Thread;
  messages: Message[];
}

export interface SourcePanelTarget {
  thread_id: string;
  /** The claim whose source_span should be highlighted in place, if any. */
  claim?: Claim;
}

/**
 * Right-hand slide-over: loads the full Slack channel thread or Gmail email
 * thread a claim came from via /api/workspace -> getThread(), renders it as
 * a real conversation, and highlights the triggering claim's source_span in
 * place using span_offset (reuses the existing .span-highlight class — the
 * project's signature element).
 *
 * Keyboard-dismissible (Escape), focus-trapped while open, and does not
 * shift page layout (fixed-position overlay + panel).
 */
export function SourcePanel({
  target,
  onClose,
}: {
  target: SourcePanelTarget | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<WorkspaceThreadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const open = target !== null;

  useEffect(() => {
    if (!target) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/workspace?thread_id=${encodeURIComponent(target.thread_id)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `request failed (${res.status})`);
        return json as WorkspaceThreadResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch only when the thread or the highlighted claim actually
    // changes, not on every re-render of the target object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.thread_id, target?.claim?.claim_id]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Focus trap + Escape-to-close + restore focus to the trigger on close.
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

  if (!open) return null;

  const thread = data?.thread;
  const kindLabel = thread?.source === "gmail" ? "Gmail thread" : "Slack channel";

  return (
    <>
      <div className="source-panel__scrim" onClick={handleClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="source-panel"
        role="dialog"
        aria-modal="true"
        aria-label={thread ? `${kindLabel}: ${thread.channel ?? thread.subject ?? thread.thread_id}` : "Source message"}
      >
        <div className="source-panel__header">
          <div>
            <div className="claim-state-label">{kindLabel}</div>
            <div className="source-panel__title">
              {thread ? (thread.channel ?? thread.subject ?? thread.thread_id) : "Loading..."}
            </div>
          </div>
          <button ref={closeButtonRef} onClick={handleClose} aria-label="Close" className="source-panel__close">
            ✕
          </button>
        </div>

        {loading && <p className="claim-state-label">Loading thread...</p>}
        {error && <div className="banner banner--warn">Could not load this thread: {error}</div>}

        {data && (
          <>
            <div className="source-panel__provenance">
              <code className="mono-cell">
                {data.tool}({"{"} thread_id: &quot;{data.thread.thread_id}&quot; {"}"})
              </code>
              <span> · served {data.servedBy}</span>
              <span> · demo workspace, not a live connection</span>
            </div>

            <div className="source-panel__thread">
              {data.messages.map((m) => (
                <SourceMessage key={m.id} message={m} highlightClaim={target?.claim?.message_id === m.id ? target.claim : undefined} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function SourceMessage({ message, highlightClaim }: { message: Message; highlightClaim?: Claim }) {
  const isTriggering = highlightClaim !== undefined;
  return (
    <div className={`source-message${isTriggering ? " source-message--marked" : ""}`}>
      <div className="source-message__meta">
        <strong>{message.author_name}</strong>
        <span className="claim-state-label">{message.author_role}</span>
        <span className="claim-state-label">{formatIST(message.timestamp)}</span>
        {isTriggering && <span className="source-message__flag">this message</span>}
      </div>
      {message.source === "gmail" && (
        <div className="claim-state-label">
          {message.from && <>from {message.from} </>}
          {message.to && message.to.length > 0 && <>to {message.to.join(", ")}</>}
        </div>
      )}
      <SourceMessageBody message={message} highlightClaim={highlightClaim} />
    </div>
  );
}

function SourceMessageBody({ message, highlightClaim }: { message: Message; highlightClaim?: Claim }) {
  if (!highlightClaim || !highlightClaim.span_valid || highlightClaim.span_offset === null) {
    return <div className="message-text">{message.text}</div>;
  }
  const start = highlightClaim.span_offset;
  const end = start + highlightClaim.source_span.length;
  const before = message.text.slice(0, start);
  const span = message.text.slice(start, end);
  const after = message.text.slice(end);
  return (
    <div className="message-text">
      {before}
      <mark className="span-highlight">{span}</mark>
      {after}
    </div>
  );
}
