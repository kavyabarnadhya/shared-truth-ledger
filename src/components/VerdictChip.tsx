"use client";

import { presentVerdict } from "@/lib/format";
import type { VerdictKind } from "@/core/types";

/**
 * Fixed colour + glyph + text label per verdict, identical everywhere. Never
 * colour alone (design brief) — a reviewer who is colourblind, or viewing a
 * greyscale screenshot in a deck, must still be able to tell verdicts apart
 * from the glyph and label alone.
 */
export function VerdictChip({ verdict, transition = false }: { verdict: VerdictKind; transition?: boolean }) {
  const p = presentVerdict(verdict);
  return (
    <span
      className={`verdict-chip verdict-chip--${p.tone}`}
      data-transition={transition ? "true" : undefined}
    >
      <span aria-hidden="true" className="verdict-chip__glyph">
        {p.glyph}
      </span>
      <span>{p.label}</span>
    </span>
  );
}
