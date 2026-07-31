/**
 * Deterministic text and value normalisation. Used by referent resolution
 * (matching a model's `raw_referent` phrase to a canonical key) and by the
 * extraction grader (comparing a predicted claim's value to gold). No model
 * call anywhere in this file — this is what makes referent resolution a
 * fixed-cost lookup rather than a per-pair model comparison.
 */

import type { CastEntry } from "./types.ts";

// ---------------------------------------------------------------------------
// Referent-phrase normalisation
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "of", "for", "on", "in", "to", "is", "are", "our", "my",
  "this", "that", "we", "you", "it", "its", "was", "be", "been", "as", "at",
  "and", "or", "with", "from",
]);

/**
 * Small hand-written suffix table. Not a real lemmatiser — just enough
 * morphological folding to make "dates"/"date", "criteria"/"criterion",
 * "assets"/"asset" converge without an NLP dependency. Guarded by a 4-char
 * minimum so short words like "vs" or "as" are never mangled.
 */
const IRREGULAR_LEMMAS: Record<string, string> = {
  criteria: "criterion",
  data: "datum",
};

function lemmatiseToken(token: string): string {
  if (IRREGULAR_LEMMAS[token]) return IRREGULAR_LEMMAS[token];
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * Fixed domain synonym map, folding surface variation onto one canonical
 * phrase fragment. Applied to the whole normalised string (not per-token)
 * because these are multi-word idioms in this domain's vocabulary.
 */
const SYNONYM_FOLDS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bgo\s*-?\s*live\b/g, replacement: "launch date" },
  { pattern: /\blaunch\s*date\b/g, replacement: "launch date" },
  { pattern: /\bship\s*date\b/g, replacement: "launch date" },
  { pattern: /\bsign\s*-?\s*off\b/g, replacement: "signoff owner" },
  { pattern: /\bsignoff\s*owner\b/g, replacement: "signoff owner" },
  { pattern: /\bapproval\s*owner\b/g, replacement: "signoff owner" },
  { pattern: /\bd\s*7\b/g, replacement: "d7" },
  { pattern: /\bday\s*7\b/g, replacement: "d7" },
  { pattern: /\bseven\s*-?\s*day\b/g, replacement: "d7" },
  { pattern: /\b7\s*-?\s*day\b/g, replacement: "d7" },
  { pattern: /\bready\s*to\s*ship\b/g, replacement: "readiness" },
  { pattern: /\brelease\s*ready\b/g, replacement: "readiness" },
  { pattern: /\brelease\s*readiness\b/g, replacement: "readiness" },
];

export interface NormalisedPhrase {
  normKey: string;
  tokens: Set<string>;
  trigrams: Set<string>;
}

/**
 * Normalises a referent phrase: lowercase -> strip diacritics -> replace
 * `_-./` with spaces -> strip punctuation -> collapse whitespace -> drop
 * stopwords -> lemmatise -> fold domain synonyms. Deterministic, no
 * randomness, same output every run.
 */
export function normalisePhrase(raw: string): NormalisedPhrase {
  let s = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[_\-./]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokensAfterStopwords = s
    .split(" ")
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map(lemmatiseToken);

  s = tokensAfterStopwords.join(" ");

  for (const { pattern, replacement } of SYNONYM_FOLDS) {
    s = s.replace(pattern, replacement);
  }
  s = s.replace(/\s+/g, " ").trim();

  // A fold can leave an adjacent duplicate behind: "golive date" folds "golive"
  // (zero-width gap still matches \s*-?\s*) to "launch date", producing
  // "launch date date" because the original trailing "date" token survives.
  // Collapsing immediate repeats keeps the token *set* correct for matching
  // without having to special-case every fold pattern's trailing words.
  const dedupedWords: string[] = [];
  for (const word of s.split(" ")) {
    if (dedupedWords[dedupedWords.length - 1] !== word) dedupedWords.push(word);
  }
  s = dedupedWords.join(" ");

  const tokens = new Set(s.split(" ").filter(Boolean));
  const trigrams = trigramSet(s);

  return { normKey: s, tokens, trigrams };
}

function trigramSet(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    out.add(padded.slice(i, i + 3));
  }
  return out;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function dice(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const denom = a.size + b.size;
  return denom === 0 ? 0 : (2 * intersection) / denom;
}

/**
 * Combined similarity used by referent resolution: token Jaccard captures
 * hard vocabulary differences ("onam" vs "independence"), trigram Dice
 * smooths morphological noise. Fixed weights, committed, never tuned
 * per-scenario.
 */
export function similarity(a: NormalisedPhrase, b: NormalisedPhrase): number {
  return 0.6 * jaccard(a.tokens, b.tokens) + 0.4 * dice(a.trigrams, b.trigrams);
}

// ---------------------------------------------------------------------------
// Value normalisation
// ---------------------------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9,
  sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

/**
 * Parses "12 August", "the 12th", "Aug 12", "2026-08-12" into an ISO date
 * using the message's own year (this corpus is entirely within 2026, so the
 * year is never ambiguous within a single event). Bare ordinals ("the 15th")
 * need a month from context — the caller supplies `contextMonth` (the month
 * of the nearest prior date mention in the same referent bucket); without it
 * this returns null, which forces callers to fall back to verbatim string
 * comparison rather than guess.
 */
export function normaliseDateValue(
  raw: string,
  year: number,
  contextMonth?: number,
): string | null {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (isoMatch) return raw.trim();

  const monthDayMatch = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(raw);
  if (monthDayMatch) {
    const monthName = monthDayMatch[1]!.toLowerCase();
    const month = MONTH_NAMES[monthName];
    if (month) {
      const day = Number(monthDayMatch[2]);
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const dayMonthMatch = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b/.exec(raw);
  if (dayMonthMatch) {
    const monthName = dayMonthMatch[2]!.toLowerCase();
    const month = MONTH_NAMES[monthName];
    if (month) {
      const day = Number(dayMonthMatch[1]);
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const bareOrdinal = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/i.exec(raw);
  if (bareOrdinal && contextMonth) {
    const day = Number(bareOrdinal[1]);
    return `${year}-${String(contextMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

/**
 * Resolves first-person and first-name references to a cast handle.
 * "me"/"I"/"myself" resolve relative to the message author. A bare first
 * name ("Priya") resolves via the cast table, which validate-corpus.ts
 * checks for first-name uniqueness so this is never ambiguous in this corpus.
 */
export function resolveHandleReference(
  raw: string,
  messageAuthor: string,
  cast: readonly CastEntry[],
): string | null {
  const trimmed = raw.trim();
  if (/^(me|i|myself)$/i.test(trimmed)) return messageAuthor;

  const lower = trimmed.toLowerCase();
  for (const c of cast) {
    if (c.handle.toLowerCase() === lower) return c.handle;
    const firstName = c.name.split(" ")[0]!.toLowerCase();
    if (firstName === lower) return c.handle;
  }
  return null;
}

const NUMBER_WITH_UNIT_RE = /^(-?\d+(?:\.\d+)?)\s*(pp|%|percent)$/i;

export interface NumberWithUnit {
  n: number;
  unit: string;
}

/** Parses "1.8pp", "3pp", "12%" into a structured value for numeric comparison. */
export function parseNumberWithUnit(raw: string): NumberWithUnit | null {
  const m = NUMBER_WITH_UNIT_RE.exec(raw.trim());
  if (!m) return null;
  const unit = m[2]!.toLowerCase() === "percent" ? "%" : m[2]!.toLowerCase();
  return { n: Number(m[1]), unit };
}

/**
 * Token-set Jaccard over normalised free text, used as the extraction
 * grader's documented fallback for comparing values that are not dates,
 * handles, or numbers (e.g. "session depth and returning players").
 */
export function freeTextSimilarity(a: string, b: string): number {
  const na = normalisePhrase(a);
  const nb = normalisePhrase(b);
  return jaccard(na.tokens, nb.tokens);
}
