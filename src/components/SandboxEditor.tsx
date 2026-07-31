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

export function SandboxEditor({
  cast,
  onRun,
  running,
}: {
  cast: CastEntry[];
  onRun: (messages: SandboxMessageInput[], live: boolean) => void;
  running: boolean;
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

  return (
    <div>
      {messages.map((m, i) => (
        <div key={i} className="drilldown" style={{ marginBottom: "var(--space-2)" }}>
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

      <div style={{ marginTop: "var(--space-2)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <label>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Enable live mode
        </label>
        <button onClick={() => onRun(messages, live)} disabled={running || messages.every((m) => !m.text.trim())}>
          {running ? "Running..." : "Run extraction + adjudication"}
        </button>
      </div>
    </div>
  );
}
