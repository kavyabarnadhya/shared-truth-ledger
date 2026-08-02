"use client";

import { useEffect, useState } from "react";
import { CONFIGS } from "@/core/model/config";
import type { CastEntry, JudgeScope } from "@/core/types";
import { ReviewerNote } from "@/components/ReviewerNote";

const STORAGE_KEY = "quorum.settings.v1";

interface SettingsState {
  extractionConfigId: string;
  adjudicationConfigId: string;
  judgeScope: JudgeScope;
  escalationThreshold: number;
  noiseGateMaxTokens: number;
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
    escalationThreshold: 0.6,
    noiseGateMaxTokens: 3,
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
    };
  } catch {
    return fallback;
  }
}

export default function SettingsPage() {
  const [cast, setCast] = useState<CastEntry[]>([]);
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [saved, setSaved] = useState(false);

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

  const configOptions = Object.values(CONFIGS);

  return (
    <main className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">
        What a production version of Quorum would let a studio configure per workspace. Changes here update local
        state only — nothing on this page is wired to inference, replay mode, or the Evals tab.
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
        <h2 className="section-heading" style={{ marginTop: 0 }}>Escalation threshold</h2>
        <p className="claim-state-label" style={{ marginTop: 0, marginBottom: "var(--space-2)" }}>
          Inactive — the confidence-gated escalation router this once drove was reverted (0 buckets ever escalated
          across the full recorded set; see README). Kept here for continuity with that design.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.escalationThreshold}
            onChange={(e) => update({ escalationThreshold: Number(e.target.value) })}
          />
          <span style={{ fontFamily: "var(--font-mono)" }}>{settings.escalationThreshold.toFixed(2)}</span>
        </label>
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
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
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
      </div>

      <p className="claim-state-label">{saved ? "Saved to this browser." : ""}</p>

      <ReviewerNote readmeHref="/architecture#reviewer-appendix">
        <p>
          Changes here update local state only and do not affect the pipeline, the recordings, or the Evals tab. In
          production, this panel would write to a per-workspace config object read by <code>ModelClient</code> and
          the pre-rule engine. Wiring it live would break the reproducibility guarantee the rest of the product
          depends on — the Evals tab promises byte-identical numbers for any reviewer, which only holds if inputs are
          fixed. This page demonstrates the configuration surface Stage 3 of the roadmap would need without taking
          that risk.
        </p>
      </ReviewerNote>
    </main>
  );
}
