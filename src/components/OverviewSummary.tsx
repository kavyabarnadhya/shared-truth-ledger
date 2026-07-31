"use client";

/**
 * Overview's live stat row: plain labelled numbers in the existing
 * mono-numeral style, not cards/tiles/gradients (design brief — see
 * globals.css). Renders whatever it's given; loading/error states are the
 * caller's job (src/app/page.tsx) so this stays a pure presentation piece.
 */
export function OverviewSummary({
  stats,
}: {
  stats: {
    bucketsTracked: number | null;
    openContradictions: number | null;
    falsePositiveRate: string | null;
    contradictionRecall: string | null;
  };
}) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Buckets tracked", value: stats.bucketsTracked === null ? "—" : String(stats.bucketsTracked) },
    { label: "Open contradictions", value: stats.openContradictions === null ? "—" : String(stats.openContradictions) },
    { label: "False positive rate", value: stats.falsePositiveRate ?? "—" },
    { label: "Contradiction recall", value: stats.contradictionRecall ?? "—" },
  ];

  return (
    <div className="headline-row">
      {items.map((item) => (
        <div className="headline-item" key={item.label}>
          <span className="headline-item__label">{item.label}</span>
          <span className="headline-fraction">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
