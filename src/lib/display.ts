/**
 * Product-language display helpers. Client-safe (no `src/server` imports) —
 * turns the internal data model (referent keys, asserter handles, claim
 * states) into copy a PM would recognise, without inventing new facts. Every
 * function here derives its output from data already on the Claim/Bucket/
 * Message/REFERENTS, never a new made-up string.
 *
 * This is vocabulary only: it does not change what the pipeline computed,
 * only how it is described on screen.
 */

import { REFERENTS } from "../core/aliases.ts";
import type { Bucket, Claim, ClaimState, Message } from "../core/types.ts";

const REFERENTS_BY_KEY = new Map(REFERENTS.map((r) => [r.key, r]));

/**
 * `REFERENTS[key].label` (hand-authored product copy) -> else the first
 * live claim's `raw_referent` (what a person actually said, pre-resolution)
 * -> else the key itself, prettified (snake/dot separators to spaces,
 * capitalised). Never returns the bare machine key when anything better is
 * available.
 */
export function referentLabel(key: string, claims?: readonly Claim[]): string {
  if (key.includes("|")) {
    return key.split("|").map((k) => referentLabel(k, claims)).join(" vs ");
  }

  const known = REFERENTS_BY_KEY.get(key);
  if (known) return known.label;

  if (claims && claims.length > 0) {
    const withRawReferent = claims.find((c) => c.referent === key && c.raw_referent && c.raw_referent.trim().length > 0);
    if (withRawReferent) return prettifyPhrase(withRawReferent.raw_referent);
  }

  return prettifyKey(key);
}

function prettifyPhrase(phrase: string): string {
  const trimmed = phrase.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function prettifyKey(key: string): string {
  const words = key.split(/[._]/g).filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Plain-English conflict headline for a bucket, e.g. "Your team disagrees
 * on the Independence Day event go-live date." Falls back gracefully for
 * ambiguity buckets and unlabelled referents so it never reads as broken.
 */
export function conflictTitle(bucket: Pick<Bucket, "referent" | "claims">, claims?: readonly Claim[]): string {
  const label = referentLabel(bucket.referent, claims ?? bucket.claims.map((bc) => bc.claim));
  if (bucket.referent.includes("|")) {
    return `Your team is using two different topics that both look like "${label}"`;
  }
  return `Your team disagrees on ${lowerFirst(label)}`;
}

function lowerFirst(s: string): string {
  if (s.length === 0) return s;
  // Keep acronym-like leading words (e.g. "D7", "QA") intact.
  if (/^[A-Z0-9]{2,}\b/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export interface SourceMeta {
  kind: "Slack" | "Gmail";
  location: string; // channel for Slack, subject for Gmail
}

/** `{ kind, location }` for a message — channel for Slack, subject for Gmail. */
export function sourceMeta(message: Pick<Message, "source" | "channel" | "subject">): SourceMeta {
  if (message.source === "slack") {
    return { kind: "Slack", location: message.channel ?? "unknown channel" };
  }
  return { kind: "Gmail", location: message.subject ?? "unknown subject" };
}

/**
 * Referents in the hand-authored catalogue (`REFERENTS`) are the real
 * topics FIXTURE_SPEC.md/GOLD_LABELS.md define. Anything else is a key the
 * free extraction model minted on its own (over-segmentation noise) — still
 * shown, but separated under "Other topics detected automatically" rather
 * than presented as an equally-curated topic.
 */
export function isCataloguedReferent(key: string): boolean {
  if (key.includes("|")) {
    return key.split("|").every((k) => REFERENTS_BY_KEY.has(k));
  }
  return REFERENTS_BY_KEY.has(key);
}

/** Plain-language label for a claim's lifecycle state. */
export function claimStateLabel(state: ClaimState): string {
  switch (state) {
    case "live":
      return "Current position";
    case "superseded":
      return "Changed their mind — replaced by a later message";
    case "withdrawn":
      return "Withdrawn";
    case "excluded_reported":
      return "Relaying someone else, not their own claim";
    case "not_yet_asserted":
      return "Not yet said, at this point in time";
  }
}
