/**
 * Display-only formatting helpers for client components. Wraps core/time's
 * formatIST (never toLocaleString — see the design brief's ban on host-
 * locale-dependent rendering) with UI-specific presentation choices:
 * verdict labels/glyphs, claim-state labels.
 */

import { formatIST as coreFormatIST } from "@/core/time";
import type { Instant, VerdictKind, ClaimState } from "@/core/types";

export const formatIST = coreFormatIST;

export interface VerdictPresentation {
  label: string;
  glyph: string;
  tone: "conflict" | "settled";
}

/**
 * Fixed colour+glyph per verdict, identical everywhere per the design
 * brief — never colour alone, so every chip also carries this glyph and a
 * text label.
 */
export function presentVerdict(verdict: VerdictKind): VerdictPresentation {
  switch (verdict) {
    case "CONTRADICTION":
      return { label: "Contradiction", glyph: "▲", tone: "conflict" };
    case "CONTESTED":
      return { label: "Contested", glyph: "◆", tone: "conflict" };
    case "UPDATE":
      return { label: "Update", glyph: "↻", tone: "settled" };
    case "RESOLVED_BY_SUPERSESSION":
      return { label: "Resolved (supersession)", glyph: "✓", tone: "settled" };
    case "RESOLVED_BY_CORRECTION":
      return { label: "Resolved (correction)", glyph: "✓", tone: "settled" };
    case "AMBIGUOUS_REFERENT":
      return { label: "Ambiguous referent", glyph: "≠", tone: "settled" };
    case "COMPATIBLE":
      return { label: "Compatible", glyph: "=", tone: "settled" };
  }
}

export function presentClaimState(state: ClaimState): string {
  switch (state) {
    case "live":
      return "live";
    case "superseded":
      return "superseded";
    case "withdrawn":
      return "withdrawn";
    case "excluded_reported":
      return "excluded (reported)";
    case "not_yet_asserted":
      return "not yet asserted";
  }
}

export function formatCost(costUsd: number | null): string {
  if (costUsd === null) return "free";
  return `$${costUsd.toFixed(4)}`;
}

/** Type-only re-export so components importing from lib/format don't also need core/time directly. */
export type { Instant };
