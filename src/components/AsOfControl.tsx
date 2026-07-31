"use client";

/**
 * A segmented control, not a dropdown, with all three values visible at
 * once: 15 Jul, 18 Jul, 24 Jul (frozen). The whole point is that the state
 * changes between them, so the options must be simultaneously visible
 * (design brief).
 */

export interface AsOfPreset {
  label: string;
  value: string;
}

export const AS_OF_PRESETS: AsOfPreset[] = [
  { label: "15 Jul", value: "2026-07-15T23:59:59+05:30" },
  { label: "18 Jul", value: "2026-07-18T23:59:59+05:30" },
  { label: "24 Jul (frozen)", value: "2026-07-24T23:59:59+05:30" },
];

export function AsOfControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (asOf: string) => void;
}) {
  return (
    <div className="segmented-control" role="group" aria-label="Evaluate as of">
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
  );
}
