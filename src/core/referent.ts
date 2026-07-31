/**
 * Deterministic-primary referent resolution. Runs after extraction, before
 * adjudication. No LLM call — comparing every claim to every other claim
 * with a model is quadratic and unaffordable; canonical referent keys make
 * adjudication a lookup within a bucket instead.
 *
 * The two hard cases this module exists to win:
 *   - N4 (Onam vs Independence): cosine similarity between "Onam event
 *     go-live date" and "Independence Day event go-live date" is high, both
 *     being "<festival> event go-live date". A discrete `forbidden`/
 *     `requiredAny` token gate resolves this correctly before any embedding
 *     step could get it wrong — see resolve()'s CANDIDATES step.
 *   - N3 (soft vs global launch): both surface phrases normalise to the
 *     identical string "launch date"; only a context-window discriminator
 *     (Canada/NZ/cohort) tells them apart. See detectAmbiguityPairs().
 */

import { REFERENTS, AMBIGUITY_GROUPS, type ReferentDef } from "./aliases.ts";
import { normalisePhrase, similarity, type NormalisedPhrase } from "./normalise.ts";
import { toEpochMs, type Instant } from "./time.ts";
import type { ReferentResolution } from "./types.ts";

const CONFIDENT_THRESHOLD = 0.62;
const AMBIGUOUS_THRESHOLD = 0.45;
const MARGIN_THRESHOLD = 0.08;
const CONTEXT_WINDOW_CHARS = 120;

export interface EmbeddingLookup {
  get(text: string): number[] | undefined;
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Extracts a ±windowChars context window around the claim's source span
 * within the full message text, used to evaluate `forbidden`/`requiredAny`
 * discriminator tokens. Falls back to the whole text if the span can't be
 * located (span validation runs separately and independently rejects
 * unlocatable spans; this function tolerates a miss gracefully rather than
 * throwing, since referent resolution should not depend on span validation
 * having already run).
 */
export function extractContextWindow(
  messageText: string,
  sourceSpan: string,
  windowChars = CONTEXT_WINDOW_CHARS,
): string {
  const idx = messageText.indexOf(sourceSpan);
  if (idx === -1) return messageText;
  const start = Math.max(0, idx - windowChars);
  const end = Math.min(messageText.length, idx + sourceSpan.length + windowChars);
  return messageText.slice(start, end);
}

function windowSatisfiesRequiredAny(windowNorm: NormalisedPhrase, requiredAny: string[][]): boolean {
  return requiredAny.every((group) =>
    group.some((phrase) => {
      const p = normalisePhrase(phrase);
      // multi-word phrases must appear as a substring of the normalised
      // window; single tokens are checked against the token set.
      if (p.tokens.size > 1) return windowNorm.normKey.includes(p.normKey);
      return windowNorm.tokens.has(p.normKey);
    }),
  );
}

function windowHasForbidden(windowNorm: NormalisedPhrase, forbidden: string[]): boolean {
  return forbidden.some((phrase) => {
    const p = normalisePhrase(phrase);
    if (p.tokens.size > 1) return windowNorm.normKey.includes(p.normKey);
    return windowNorm.tokens.has(p.normKey);
  });
}

interface Candidate {
  def: ReferentDef;
  score: number;
}

function scoreCandidates(rawNorm: NormalisedPhrase, windowNorm: NormalisedPhrase): Candidate[] {
  const candidates: Candidate[] = [];
  for (const def of REFERENTS) {
    let score = 0;
    for (const phrase of [def.label, ...def.aliases]) {
      const p = normalisePhrase(phrase);
      score = Math.max(score, similarity(rawNorm, p));
    }
    if (def.forbidden && windowHasForbidden(windowNorm, def.forbidden)) {
      score = 0;
    }
    if (def.requiredAny && !windowSatisfiesRequiredAny(windowNorm, def.requiredAny)) {
      score = 0;
    }
    candidates.push({ def, score });
  }
  // Deterministic tiebreak: score desc, then key asc.
  candidates.sort((a, b) => b.score - a.score || (a.def.key < b.def.key ? -1 : 1));
  return candidates;
}

export interface ResolveContext {
  messageText: string;
  sourceSpan: string;
  embeddings?: EmbeddingLookup;
}

/**
 * True when `def`'s discrete gates would zero it out for this context
 * window — i.e. it mentions a forbidden token, or fails to mention a
 * required one. Used to make EXACT and ALIAS matching respect the same
 * gates as lexical candidate scoring: without this, "launch date" being an
 * exact alias of `indep_event.launch_date` would resolve there unconditionally
 * and the Canada/NZ discriminator that's supposed to redirect it to
 * `soft_launch.date` (N3) would never get consulted.
 */
function isDisqualifiedByWindow(def: ReferentDef, windowNorm: NormalisedPhrase): boolean {
  if (def.forbidden && windowHasForbidden(windowNorm, def.forbidden)) return true;
  if (def.requiredAny && !windowSatisfiesRequiredAny(windowNorm, def.requiredAny)) return true;
  return false;
}

export function resolveReferent(rawReferent: string, ctx: ResolveContext): ReferentResolution {
  const notes: string[] = [];
  const rawNorm = normalisePhrase(rawReferent);
  const windowText = extractContextWindow(ctx.messageText, ctx.sourceSpan);
  const windowNorm = normalisePhrase(windowText);

  // EXACT: raw phrase normalises to exactly a canonical key, and the def
  // isn't disqualified by this claim's context window.
  for (const def of REFERENTS) {
    if (isDisqualifiedByWindow(def, windowNorm)) continue;
    if (rawNorm.normKey === normalisePhrase(def.key.replace(/[._]/g, " ")).normKey) {
      notes.push(`exact match on canonical key "${def.key}"`);
      return {
        raw: rawReferent, resolved: def.key, method: "exact_key", score: 1,
        runnerUp: null, band: "confident", embeddingUsed: false, notes,
      };
    }
  }

  // ALIAS: raw phrase normalises to exactly one of a def's aliases, subject
  // to the same window gates as EXACT above.
  for (const def of REFERENTS) {
    if (isDisqualifiedByWindow(def, windowNorm)) continue;
    for (const alias of def.aliases) {
      if (rawNorm.normKey === normalisePhrase(alias).normKey) {
        notes.push(`exact alias match "${alias}" -> "${def.key}"`);
        return {
          raw: rawReferent, resolved: def.key, method: "alias", score: 1,
          runnerUp: null, band: "confident", embeddingUsed: false, notes,
        };
      }
    }
  }

  // CANDIDATES: lexical similarity + discrete window gates.
  let candidates = scoreCandidates(rawNorm, windowNorm);

  const top = candidates[0];
  const runnerUp = candidates[1];

  // Anything that doesn't clear the ambiguous-band floor is "below
  // threshold" per the design: mint a new referent rather than force the
  // claim into whichever unrelated candidate happened to score highest.
  // This covers both "nothing scored above zero" (every def disqualified or
  // wholly dissimilar) and "some def scored a little, but not enough to
  // mean anything" — a 0.04 lexical score is noise, not a weak signal.
  if (!top || top.score < AMBIGUOUS_THRESHOLD) {
    notes.push(
      top
        ? `top candidate "${top.def.key}" scored ${top.score.toFixed(3)}, below the ${AMBIGUOUS_THRESHOLD} floor; minting new referent`
        : "no candidates available; minting new referent",
    );
    const mintedKey = rawNorm.normKey.replace(/\s+/g, "_") || "unknown_referent";
    return {
      raw: rawReferent, resolved: mintedKey, method: "new_referent", score: top?.score ?? 0,
      runnerUp: null, band: "below_threshold", embeddingUsed: false, notes,
    };
  }

  let band: ReferentResolution["band"];
  if (top.score >= CONFIDENT_THRESHOLD) band = "confident";
  else band = "ambiguous";

  // A tight margin against the runner-up demotes an otherwise-confident match
  // to "ambiguous" — two candidates neck-and-neck is itself a signal worth
  // surfacing, even when the top score alone would have looked decisive.
  const marginIsTight = runnerUp !== undefined && top.score - runnerUp.score < MARGIN_THRESHOLD;
  if (marginIsTight) band = "ambiguous";

  notes.push(
    `lexical top candidate "${top.def.key}" score=${top.score.toFixed(3)}` +
      (runnerUp ? `, runner-up "${runnerUp.def.key}" score=${runnerUp.score.toFixed(3)}` : ", no runner-up"),
  );

  let embeddingUsed = false;
  if (band === "ambiguous" && ctx.embeddings) {
    const topN = candidates.slice(0, 3).filter((c) => c.score > 0);
    const rawEmbedding = ctx.embeddings.get(rawReferent);
    if (rawEmbedding) {
      const rescored: Candidate[] = topN.map((c) => {
        const labelEmbedding = ctx.embeddings!.get(c.def.label);
        if (!labelEmbedding) return c;
        const cos = cosineSimilarity(rawEmbedding, labelEmbedding);
        return { def: c.def, score: 0.5 * c.score + 0.5 * cos };
      });
      rescored.sort((a, b) => b.score - a.score || (a.def.key < b.def.key ? -1 : 1));
      if (rescored.length > 0) {
        candidates = [...rescored, ...candidates.slice(topN.length)];
        embeddingUsed = true;
        notes.push(
          `embedding tiebreak applied; re-ranked top: ${rescored.map((c) => `${c.def.key}=${c.score.toFixed(3)}`).join(", ")}`,
        );
      }
    } else {
      notes.push("embedding unavailable, lexical-only tiebreak");
    }
  } else if (band === "ambiguous") {
    notes.push("embedding unavailable, lexical-only tiebreak");
  }

  const finalTop = candidates[0]!;
  const finalRunnerUp = candidates[1];
  // By this point `band` is always "confident" or "ambiguous" (below-threshold
  // scores returned early above), so a tight margin can only ever demote a
  // plausible match to "ambiguous" — never promote a near-zero score.
  const stillTight =
    finalRunnerUp !== undefined && finalTop.score - finalRunnerUp.score < MARGIN_THRESHOLD;

  return {
    raw: rawReferent,
    resolved: finalTop.def.key,
    method: embeddingUsed ? "embedding_tiebreak" : band === "ambiguous" ? "ambiguous" : "lexical_similarity",
    score: finalTop.score,
    runnerUp: finalRunnerUp ? { key: finalRunnerUp.def.key, score: finalRunnerUp.score } : null,
    band: stillTight ? "ambiguous" : band,
    embeddingUsed,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Cross-referent ambiguity pair detection (N3)
// ---------------------------------------------------------------------------

export interface AmbiguityCandidateClaim {
  claim_id: string;
  referent: string;
  raw_referent: string;
  value: string;
  timestamp: Instant;
  thread_id: string;
  channel?: string;
}

export interface AmbiguityPair {
  groupId: string;
  a: AmbiguityCandidateClaim;
  b: AmbiguityCandidateClaim;
  bucketKey: string;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Finds pairs of live claims in different referents of the same
 * AMBIGUITY_GROUP whose raw surface phrasing normalises identically, occur
 * within 24h of each other in the same thread/channel, and disagree on
 * value. This is what turns "two correctly-resolved, non-conflicting
 * buckets" into a visible AMBIGUOUS_REFERENT signal for N3, without
 * disturbing either bucket's own contents (both keep their claims; this
 * emits an additional cross-referent bucket alongside them).
 */
export function detectAmbiguityPairs(
  claimsByReferent: ReadonlyMap<string, readonly AmbiguityCandidateClaim[]>,
): AmbiguityPair[] {
  const pairs: AmbiguityPair[] = [];

  for (const group of AMBIGUITY_GROUPS) {
    const memberClaims = group.members.flatMap((key) => claimsByReferent.get(key) ?? []);
    for (let i = 0; i < memberClaims.length; i++) {
      for (let j = i + 1; j < memberClaims.length; j++) {
        const a = memberClaims[i]!;
        const b = memberClaims[j]!;
        if (a.referent === b.referent) continue;

        const aNorm = normalisePhrase(a.raw_referent).normKey;
        const bNorm = normalisePhrase(b.raw_referent).normKey;
        if (aNorm !== bNorm) continue;

        const aTime = toEpochMs(a.timestamp);
        const bTime = toEpochMs(b.timestamp);
        if (Math.abs(aTime - bTime) > TWENTY_FOUR_HOURS_MS) continue;

        const sameContext = a.thread_id === b.thread_id || (a.channel && a.channel === b.channel);
        if (!sameContext) continue;

        if (a.value === b.value) continue; // same value -> not a conflict, nothing to flag

        const [first, second] = a.claim_id < b.claim_id ? [a, b] : [b, a];
        const bucketKey = [first.referent, second.referent].sort().join("|");
        pairs.push({ groupId: group.id, a: first, b: second, bucketKey });
      }
    }
  }

  // Deterministic order for downstream consumers.
  pairs.sort((x, y) => (x.bucketKey < y.bucketKey ? -1 : x.bucketKey > y.bucketKey ? 1 : 0));
  return pairs;
}
