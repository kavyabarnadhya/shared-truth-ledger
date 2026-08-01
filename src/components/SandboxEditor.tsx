"use client";

import { useState } from "react";
import type { CastEntry } from "@/core/types";

export interface SandboxMessageInput {
  author: string;
  author_role: string;
  text: string;
  timestamp: string;
  channel: string;
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
 * dead-ends into a replay-miss on first use. Timestamps and authors match
 * real corpus messages exactly (see fixtures/corpus/messages.json) so these
 * replay cleanly against the committed recordings without live mode.
 */
export const SANDBOX_EXAMPLES: SandboxExample[] = [
  {
    label: "The launch date disagreement",
    description: "The flagship example — two people asserting different dates for the same event.",
    messages: [
      {
        author: "meera.iyer",
        author_role: "Product Manager",
        text: "Kicking off planning for the Independence Day event. Working assumption is we go live 12 August, config frozen by the 5th so QA gets a clean week.",
        timestamp: "2026-07-06T10:12+05:30",
        channel: "#liveops-ludojunction",
      },
      {
        author: "priya.raghunathan",
        author_role: "Producer",
        text: "Launch is the 15th.",
        timestamp: "2026-07-13T10:44+05:30",
        channel: "#liveops-ludojunction",
      },
    ],
  },
  {
    label: "A studio head's final call",
    description: "How authority-based supersession settles a conflict without a model call.",
    messages: [
      {
        author: "priya.raghunathan",
        author_role: "Producer",
        text: "Go-live is 15 August, aligned to the holiday itself. Sign-off gate is the 12th.",
        timestamp: "2026-07-15T18:22+05:30",
        channel: "#liveops-ludojunction",
      },
      {
        author: "karthik.nair",
        author_role: "Studio Head",
        text: "Let's go with the 15th. Aligning to the holiday itself is worth more than the extra three days of runway. Final.",
        timestamp: "2026-07-17T20:15+05:30",
        channel: "#liveops-ludojunction",
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
    setMessages((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
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
              {cast.map((c) => (
                <option key={c.handle} value={c.handle}>
                  {c.name}
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
    </div>
  );
}
