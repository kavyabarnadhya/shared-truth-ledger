"use client";

/**
 * "Rewind the ledger" — a segmented control, not a dropdown, with all three
 * values visible at once: 15 Jul, 18 Jul, 24 Jul (frozen). The whole point
 * is that the state changes between them, so the options must be
 * simultaneously visible (design brief) — each captioned by what actually
 * changed in the flagship story rather than a bare date.
 */

export interface AsOfPreset {
  label: string;
  value: string;
  caption: string;
}

export const AS_OF_PRESETS: AsOfPreset[] = [
  { label: "15 Jul", value: "2026-07-15T23:59:59+05:30", caption: "Before the studio head weighed in" },
  { label: "18 Jul", value: "2026-07-18T23:59:59+05:30", caption: "After the studio head settled it" },
  { label: "24 Jul (today)", value: "2026-07-24T23:59:59+05:30", caption: "Present day — frozen for this demo" },
];

export function AsOfControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (asOf: string) => void;
}) {
  return (
    <div>
      <div className="segmented-control" role="group" aria-label="Rewind the ledger">
        {AS_OF_PRESETS.map((preset) => (
          <button
            key={preset.value}
            className="segmented-control__option"
            data-active={value === preset.value ? "true" : undefined}
            onClick={() => onChange(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="claim-state-label" style={{ marginTop: "0.3em" }}>
        {AS_OF_PRESETS.find((p) => p.value === value)?.caption}
      </div>
    </div>
  );
}
