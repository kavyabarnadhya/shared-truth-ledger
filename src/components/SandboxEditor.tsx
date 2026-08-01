"use client";

import { useState } from "react";
import type { CastEntry } from "@/core/types";

export interface SandboxMessageInput {
  author: string;
  author_role: string;
  text: string;
  timestamp: string;
  channel: string;
  /** Real thread id, set only alongside source_message_id below (default "#sandbox"/"SANDBOX" otherwise). */
  thread_id?: string;
  /**
   * Set only by SANDBOX_EXAMPLES below, never by free typing (editing any
   * field clears it — see `update()`). Lets a prefilled example replay
   * against its real committed recording instead of a guaranteed
   * replay-miss; the server independently re-verifies text/author/
   * timestamp still match before trusting it.
   */
  source_message_id?: string;
}

const DEFAULT_TIMESTAMP = "2026-07-24T12:00+05:30";

function emptyMessage(author: string, role: string): SandboxMessageInput {
  return { author, author_role: role, text: "", timestamp: DEFAULT_TIMESTAMP, channel: "#sandbox" };
}

export interface SandboxExample {
  label: string;
  description: string;
  messages: SandboxMessageInput[];
}

/**
 * Prefilled examples that hit committed recordings, so "Try it" never
 * dead-ends into a replay-miss on first use. Text/author/timestamp are
 * copied character-for-character from real corpus messages that are each
 * the FIRST message of their real thread (empty context window) and each
 * carry a committed extraction recording — the two conditions that make an
 * exact cache-key match possible from a small sandbox submission (see
 * api/sandbox/route.ts's source_message_id handling). Every field must stay
 * byte-identical to fixtures/corpus/messages.json for the match to hold.
 */
export const SANDBOX_EXAMPLES: SandboxExample[] = [
  {
    label: "The launch date disagreement",
    description: "The flagship example — two people asserting different dates for the same event, from different sources.",
    messages: [
      {
        author: "meera.iyer",
        author_role: "Product Manager",
        text: "Kicking off planning for the Independence Day event. Working assumption is we go live 12 August, config frozen by the 5th so QA gets a clean week.",
        timestamp: "2026-07-06T10:12:00+05:30",
        channel: "#liveops-ludojunction",
        thread_id: "T1",
        source_message_id: "M-001",
      },
      {
        author: "priya.raghunathan",
        author_role: "Producer",
        text: "Sharing the release plan for the Independence Day event. Go-live is 15 August, aligned to the holiday itself. Sign-off gate is the 12th.",
        timestamp: "2026-07-15T18:22:00+05:30",
        channel: "#liveops-ludojunction",
        thread_id: "T2",
        source_message_id: "M-002",
      },
    ],
  },
  {
    label: "A release-readiness blocker",
    description: "One QA message, read alone — see what extraction pulls out of a single real message.",
    messages: [
      {
        author: "farah.qureshi",
        author_role: "QA Lead",
        text: "Build 1.9.4 has an open P1 — token animation desyncs on reconnect. This is not release-ready.",
        timestamp: "2026-07-22T17:40:00+05:30",
        channel: "#qa-releases",
        thread_id: "T5",
        source_message_id: "M-060",
      },
    ],
  },
];

export function SandboxEditor({
  cast,
  onRun,
  running,
  liveAvailable,
  liveUnavailableReason,
}: {
  cast: CastEntry[];
  onRun: (messages: SandboxMessageInput[], live: boolean) => void;
  running: boolean;
  liveAvailable: boolean;
  liveUnavailableReason: string | null;
}) {
  const [messages, setMessages] = useState<SandboxMessageInput[]>([
    emptyMessage(cast[0]?.handle ?? "meera.iyer", cast[0]?.role ?? ""),
  ]);
  const [live, setLive] = useState(false);

  function update(i: number, patch: Partial<SandboxMessageInput>) {
    // Any hand edit invalidates the "this is a real corpus message"
    // shortcut — clear source_message_id so an edited example is treated
    // as fresh input (the server re-verifies anyway, this just keeps the
    // client-side intent honest).
    setMessages((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch, source_message_id: undefined, thread_id: undefined } : m)));
  }

  function addMessage() {
    if (messages.length >= 2) return;
    setMessages((prev) => [...prev, emptyMessage(cast[1]?.handle ?? cast[0]?.handle ?? "meera.iyer", cast[1]?.role ?? "")]);
  }

  function removeMessage(i: number) {
    setMessages((prev) => prev.filter((_, idx) => idx !== i));
  }

  function loadExample(example: SandboxExample) {
    setMessages(example.messages.map((m) => ({ ...m })));
  }

  return (
    <div>
      <div className="sandbox-examples">
        <span className="claim-state-label">Prefilled examples (guaranteed to work in replay mode):</span>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-1)" }}>
          {SANDBOX_EXAMPLES.map((ex) => (
            <button key={ex.label} onClick={() => loadExample(ex)} title={ex.description}>
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {messages.map((m, i) => (
        <div key={i} className="drilldown" style={{ marginBottom: "var(--space-2)", marginTop: "var(--space-2)" }}>
          <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
            <select value={m.author} onChange={(e) => {
              const entry = cast.find((c) => c.handle === e.target.value);
              update(i, { author: e.target.value, author_role: entry?.role ?? "" });
            }}>
              {cast.filter((c) => !c.is_bot).map((c) => (
                <option key={c.handle} value={c.handle}>
                  {c.name} — {c.role}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={m.timestamp}
              onChange={(e) => update(i, { timestamp: e.target.value })}
              placeholder="2026-07-24T12:00+05:30"
              className="mono-cell"
            />
            {messages.length > 1 && <button onClick={() => removeMessage(i)}>Remove</button>}
          </div>
          <textarea
            value={m.text}
            onChange={(e) => update(i, { text: e.target.value })}
            maxLength={1200}
            rows={3}
            style={{ width: "100%", fontFamily: "var(--font-sans)" }}
            placeholder="Type a message..."
          />
          <div className="claim-state-label">{m.text.length}/1200 characters</div>
        </div>
      ))}

      {messages.length < 2 && <button onClick={addMessage}>Add a second message</button>}

      <div style={{ marginTop: "var(--space-2)", display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <label title={liveAvailable ? "" : liveUnavailableReason ?? ""}>
          <input
            type="checkbox"
            checked={live && liveAvailable}
            disabled={!liveAvailable}
            onChange={(e) => setLive(e.target.checked)}
          />{" "}
          Enable live mode{!liveAvailable && liveUnavailableReason ? ` (${liveUnavailableReason})` : ""}
        </label>
        <button onClick={() => onRun(messages, live && liveAvailable)} disabled={running || messages.every((m) => !m.text.trim())}>
          {running ? "Running..." : "Run extraction + adjudication"}
        </button>
      </div>
      {!liveAvailable && (
        <p className="claim-state-label" style={{ marginTop: "var(--space-1)" }}>
          Replay mode below needs no setup and is what every number in this app is based on. To turn live mode on for
          this deployment: Vercel dashboard → Project Settings → Environment Variables → set{" "}
          <code>AI_GATEWAY_API_KEY</code> and <code>LIVE_MODE_ENABLED=true</code> → redeploy. Full steps in the
          README&apos;s &ldquo;Enabling live mode on a Vercel deployment&rdquo; section.
        </p>
      )}
    </div>
  );
}
