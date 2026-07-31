/**
 * The most important function in the project. Every extracted claim carries
 * a `source_span` the model claims is copied verbatim from the source
 * message; this is the code that checks whether that's actually true. A
 * claim whose span cannot be located in the real message text is a
 * hallucination — a value the model asserted without textual grounding — and
 * must be rejected before it ever reaches a bucket, a pre-rule, or the
 * adjudicator.
 *
 * Tolerance is deliberately narrow. The only normalisation permitted is
 * whitespace and common "smart" typography (curly quotes, em/en dashes)
 * differing between the model's copy and the source — because a model
 * re-typing an em dash as a hyphen is not evidence it invented the claim.
 * Everything else — case changes, dropped/added words, paraphrase,
 * "..." truncation, stemming — is a genuine mismatch and fails.
 */

export type SpanRejectReason =
  | "empty_span"
  | "not_found";

export type SpanValidationResult =
  | { ok: true; offset: number; matched: string }
  | { ok: false; reason: SpanRejectReason };

/**
 * Maps curly quotes and dashes to their plain-ASCII equivalents and collapses
 * whitespace runs, while returning an index map so a match found in the
 * normalised string can be translated back to an offset in the original.
 */
function normaliseWithIndexMap(text: string): { normalised: string; toOriginal: number[] } {
  const CHAR_MAP: Record<string, string> = {
    "‘": "'", "’": "'", // ' '
    "“": '"', "”": '"', // " "
    "–": "-", "—": "-", // – —
    " ": " ", // nbsp
    "\t": " ", "\n": " ", "\r": " ",
  };

  let normalised = "";
  const toOriginal: number[] = [];
  let lastWasSpace = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const mapped = CHAR_MAP[ch] ?? ch;
    const isSpace = mapped === " ";
    if (isSpace && lastWasSpace) {
      // collapse consecutive whitespace into a single space; drop this char
      continue;
    }
    normalised += mapped;
    toOriginal.push(i);
    lastWasSpace = isSpace;
  }

  return { normalised, toOriginal };
}

/**
 * Validates that `span` appears verbatim in `text`. Tries an exact substring
 * match first (the common, fast, and strictest case); only on a miss does it
 * fall back to the whitespace/typography-normalised comparison described
 * above. Anything that still doesn't match is rejected outright — this
 * function has no third tier of tolerance.
 */
export function validateSpan(text: string, span: string): SpanValidationResult {
  if (span.trim().length === 0) {
    return { ok: false, reason: "empty_span" };
  }

  const exactOffset = text.indexOf(span);
  if (exactOffset !== -1) {
    return { ok: true, offset: exactOffset, matched: span };
  }

  const normText = normaliseWithIndexMap(text);
  const normSpan = normaliseWithIndexMap(span).normalised;
  const normOffset = normText.normalised.indexOf(normSpan);
  if (normOffset !== -1) {
    const originalOffset = normText.toOriginal[normOffset];
    if (originalOffset !== undefined) {
      return { ok: true, offset: originalOffset, matched: span };
    }
  }

  return { ok: false, reason: "not_found" };
}
