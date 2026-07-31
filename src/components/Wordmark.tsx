/**
 * Product wordmark: glyph + name. Used in the sidebar and the hosted deck —
 * kept as one component so both places render identically. The diamond
 * glyph is the only place `--accent` (the one new brand token) shows up
 * besides the sidebar's active nav state.
 */

export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark__glyph" aria-hidden="true">
        ◇
      </span>
      <span className="wordmark__name">Quorum</span>
    </span>
  );
}
