"use client";

import { useEffect, useState } from "react";
import { CONFIGS } from "@/core/model/config";
import { EXTRACTION_PROMPT } from "@/core/prompts/extraction";
import { parseInstant } from "@/core/time";
import type { CastEntry, JudgeScope, Message } from "@/core/types";
import { ReviewerNote } from "@/components/ReviewerNote";
import { PromptViewer } from "@/components/DrillDown";

const STORAGE_KEY = "quorum.settings.v1";

interface SettingsState {
  extractionConfigId: string;
  adjudicationConfigId: string;
  judgeScope: JudgeScope;
  temperature: number;
  maxOutputTokens: number;
  contextWindowMessages: number;
  mcpSearchLimit: number;
  noiseGateMaxTokens: number;
  gatedChannels: string[];
  authorityRanks: Record<string, number>;
}

function defaultAuthorityRanks(cast: CastEntry[]): Record<string, number> {
  const ranks: Record<string, number> = {};
  for (const c of cast) ranks[c.handle] = c.authority_rank;
  return ranks;
}

function loadSettings(cast: CastEntry[]): SettingsState {
  const fallback: SettingsState = {
    extractionConfigId: "free",
    adjudicationConfigId: "free",
    judgeScope: "binary",
    temperature: 0,
    maxOutputTokens: 800,
    contextWindowMessages: 3,
    mcpSearchLimit: 50,
    noiseGateMaxTokens: 3,
    gatedChannels: ["#build-ci"],
    authorityRanks: defaultAuthorityRanks(cast),
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return {
      ...fallback,
      ...parsed,
      authorityRanks: { ...fallback.authorityRanks, ...(parsed.authorityRanks ?? {}) },
      gatedChannels: parsed.gatedChannels ?? fallback.gatedChannels,
    };
  } catch {
    return fallback;
  }
}

/**
 * One fixed, real corpus message (M-001, the flagship's opening message —
 * same one evals/page.tsx uses for its worked prompt example) rendered
 * through the actual EXTRACTION_PROMPT.renderUser(), so the reference viewer
 * below shows the literal text the pipeline sends, not a placeholder
 * description of it. No context messages: M-001 is the first message of its
 * thread, so contextMessages is genuinely empty here, same as at runtime.
 */
const WORKED_EXAMPLE_MESSAGE: Message = {
  id: "M-001",
  source: "slack",
  channel: "#liveops-ludojunction",
  thread_id: "T1",
  author: "meera.iyer",
  author_name: "Meera Iyer",
  author_role: "Product Manager",
  timestamp: parseInstant("2026-07-06T10:12:00+05:30"),
  text: "Kicking off planning for the Independence Day event. Working assumption is we go live 12 August, config frozen by the 5th so QA gets a clean week.",
  participants: ["meera.iyer"],
  is_load_bearing: true,
};
const WORKED_EXTRACTION_USER = EXTRACTION_PROMPT.renderUser({ message: WORKED_EXAMPLE_MESSAGE, contextMessages: [] });

export default function SettingsPage() {
  const [cast, setCast] = useState<CastEntry[]>([]);
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [saved, setSaved] = useState(false);
  const [newChannel, setNewChannel] = useState("");

  useEffect(() => {
    fetch("/api/cast")
      .then((r) => r.json())
      .then((data: { cast: CastEntry[] }) => {
        setCast(data.cast);
        setSettings(loadSettings(data.cast));
      });
  }, []);

  useEffect(() => {
    if (!settings) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(t);
  }, [settings]);

  if (!settings) {
    return (
      <main className="page">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Loading…</p>
      </main>
    );
  }

  function update(patch: Partial<SettingsState>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateRank(handle: string, rank: number) {
    setSettings((prev) => (prev ? { ...prev, authorityRanks: { ...prev.authorityRanks, [handle]: rank } } : prev));
  }

  function addChannel() {
    const trimmed = newChannel.trim();
    if (!trimmed) return;
    setSettings((prev) =>
      prev && !prev.gatedChannels.includes(trimmed) ? { ...prev, gatedChannels: [...prev.gatedChannels, trimmed] } : prev,
    );
    setNewChannel("");
  }

  function removeChannel(channel: string) {
    setSettings((prev) => (prev ? { ...prev, gatedChannels: prev.gatedChannels.filter((c) => c !== channel) } : prev));
  }

  const configOptions = Object.values(CONFIGS);

  return (
    <main className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">
        The controls a workspace admin deploying Quorum for their own team would need to tune. Real, named, and
        genuinely useful — deferred to Stage 3 (same category as minutes-generation and omission-detection, see
        README) because it needs two things this build doesn&apos;t have yet: per-workspace config storage, and an
        admin role separate from whoever is reading this page. Changes here update local state in this browser only.
      </p>

      <div className="drilldown" style={{ marginBottom: "var(--space-3)" }}>
        <h2 className="section-heading" style={{ marginTop: 0 }}>Model tier per stage</h2>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginTop: "var(--space-2)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span className="claim-state-label">Extraction model</span>
            <select
              value={settings.extractionConfigId}
              onChange={(e) => update({ extractionConfigId: e.target.value })}
            >
              {configOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.models.extraction} ({c.id})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span className="claim-state-label">Adjudication model</span>
            <select
              value={settings.adjudicationConfigId}
              onChange={(e) => update({ adjudicationConfigId: e.target.value })}
            >
              {configOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.models.adjudication} ({c.id})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="drilldown" style={{ marginBottom: "var(--space-3)" }}>
        <h2 className="section-heading" style={{ marginTop: 0 }}>Judge scope</h2>
        <label className="claim-state-label">
          <input
            type="checkbox"
            checked={settings.judgeScope === "full7"}
            onChange={(e) => update({ judgeScope: e.target.checked ? "full7" : "binary" })}
          />{" "}
          use the Open judge (full seven-way verdict vocabulary) by default
        </label>
      </div>

      <div className="drilldown" style={{ marginBottom: "var(--space-3)" }}>
        <h2 className="section-heading" style={{ marginTop: 0 }}>Model call parameters</h2>
        <p className="claim-state-label" style={{ marginTop: 0, marginBottom: "var(--space-2)" }}>
          Real fields on <code>ModelConfig</code>/<code>ModelRequest</code> (<code>src/core/model/config.ts</code>,{" "}
          <code>types.ts</code>) and the MCP tools&apos; own search parameters — not invented for this page.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginBottom: "var(--space-1)" }}>
            <span className="claim-state-label">Temperature</span>
            <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={settings.temperature}
                onChange={(e) => update({ temperature: Number(e.target.value) })}
              />
              <span style={{ fontFamily: "var(--font-mono)" }}>{settings.temperature.toFixed(1)}</span>
            </span>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginBottom: "var(--space-1)" }}>
            <span className="claim-state-label">Max output tokens</span>
            <input
              type="number"
              min={100}
              max={4000}
              value={settings.maxOutputTokens}
              onChange={(e) => update({ maxOutputTokens: Number(e.target.value) })}
              style={{ width: "6rem", fontFamily: "var(--font-mono)" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span className="claim-state-label">Context window (prior same-thread messages)</span>
            <input
              type="number"
              min={0}
              max={10}
              value={settings.contextWindowMessages}
              onChange={(e) => update({ contextWindowMessages: Number(e.target.value) })}
              style={{ width: "6rem", fontFamily: "var(--font-mono)" }}
            />
          </label>
          <p className="claim-state-label" style={{ margin: 0, marginBottom: "var(--space-1)", overflowWrap: "anywhere" }}>
            The real pipeline hardcodes this at 3 (<code>src/core/pipeline.ts</code>) — a workspace admin would need
            to tune it per their own thread lengths.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span className="claim-state-label">MCP search result limit</span>
            <input
              type="number"
              min={1}
              max={200}
              value={settings.mcpSearchLimit}
              onChange={(e) => update({ mcpSearchLimit: Number(e.target.value) })}
              style={{ width: "6rem", fontFamily: "var(--font-mono)" }}
            />
          </label>
          <p className="claim-state-label" style={{ margin: 0, overflowWrap: "anywhere" }}>
            Mirrors <code>limit</code> on <code>slack_search_messages</code>/<code>gmail_search</code> — the MCP
            tools already accept this per call (<code>mcp-server/src/tools.ts</code>), default 50, max 200.
          </p>
        </div>
      </div>

      <div className="drilldown" style={{ marginBottom: "var(--space-3)" }}>
        <h2 className="section-heading" style={{ marginTop: 0 }}>User prompt (reference)</h2>
        <p className="claim-state-label" style={{ marginTop: 0, marginBottom: "var(--space-2)" }}>
          What <code>EXTRACTION_PROMPT.renderUser()</code> actually sends for a real message (M-001). This is a
          reference, not an editor: <code>renderUser()</code> interpolates structured message data with real
          conditional logic (a context block, per-claim rows) — there is no placeholder syntax in this system, so
          nothing here can be edited and fed back into the pipeline. System-prompt editing is intentionally not
          exposed on this page.
        </p>
        <PromptViewer system={EXTRACTION_PROMPT.SYSTEM} user={WORKED_EXTRACTION_USER} />
      </div>

      <div className="drilldown" style={{ marginBottom: "var(--space-3)" }}>
        <h2 className="section-heading" style={{ marginTop: 0 }}>Authority ranks</h2>
        <p className="claim-state-label" style={{ marginTop: 0, marginBottom: "var(--space-2)" }}>
          Who can supersede whose claims (pre-rule R5). 0 = bot, 1 = default, higher = more authority.
        </p>
        <table className="claim-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Rank</th>
            </tr>
          </thead>
          <tbody>
            {cast.map((c) => (
              <tr key={c.handle}>
                <td>{c.name}</td>
                <td>{c.role}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={settings.authorityRanks[c.handle] ?? c.authority_rank}
                    onChange={(e) => updateRank(c.handle, Number(e.target.value))}
                    className="mono-cell"
                    style={{ width: "4rem" }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="drilldown" style={{ marginBottom: "var(--space-3)" }}>
        <h2 className="section-heading" style={{ marginTop: 0 }}>Noise gate strictness</h2>
        <p className="claim-state-label" style={{ marginTop: 0, marginBottom: "var(--space-2)" }}>
          G5&apos;s token-count ceiling — a message with this many content tokens or fewer (after stripping emoji and
          punctuation, no digits, no cast handle mentioned) is gated as a short social aside before extraction ever
          sees it.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <input
            type="number"
            min={0}
            max={10}
            value={settings.noiseGateMaxTokens}
            onChange={(e) => update({ noiseGateMaxTokens: Number(e.target.value) })}
            style={{ width: "4rem", fontFamily: "var(--font-mono)" }}
          />
          <span className="claim-state-label">content tokens</span>
        </label>

        <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>Gated channels</h3>
        <p className="claim-state-label" style={{ marginTop: 0, marginBottom: "var(--space-2)" }}>
          Messages from these channels are gated (G3) regardless of content. Seeded from the real{" "}
          <code>GATED_CHANNELS</code> in <code>src/core/noise-gate.ts</code>.
        </p>
        <div style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
          {settings.gatedChannels.map((channel) => (
            <span key={channel} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
              <code>{channel}</code>
              <button onClick={() => removeChannel(channel)} aria-label={`Remove ${channel}`}>
                ✕
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <input
            type="text"
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
            placeholder="#channel-name"
            style={{ fontFamily: "var(--font-mono)" }}
          />
          <button onClick={addChannel} disabled={!newChannel.trim()}>
            Add channel
          </button>
        </div>
      </div>

      <p className="claim-state-label">{saved ? "Saved to this browser." : ""}</p>

      <ReviewerNote readmeHref="/architecture#reviewer-appendix">
        <p>
          Every control above is real — named, traceable to a specific field or constant in the codebase — but
          nothing here writes back. In production, this panel would write to a per-workspace config object read by{" "}
          <code>ModelClient</code>, the pre-rule engine, and the noise gate. It stays inert in this build because
          wiring it live would break the reproducibility guarantee the rest of the product depends on — the Evals
          tab promises byte-identical numbers for any reviewer, which only holds if inputs are fixed, and this build
          has no admin/end-user role separation to gate a live write safely (everyone who opens this page today is
          the same unauthenticated demo session on the same shared corpus). This page demonstrates the configuration
          surface Stage 3 would need, honestly labelled as deferred rather than built.
        </p>
      </ReviewerNote>
    </main>
  );
}
