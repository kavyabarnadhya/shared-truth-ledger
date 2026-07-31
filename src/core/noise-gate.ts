/**
 * Deterministic pre-extraction noise gate. No model call — paying a model to
 * recognise a webhook is a design smell. Every rule is redundant by design:
 * the canonical noise messages (bots, CI, store notifications, newsletters,
 * social chatter) are each caught by more than one rule, so no single regex
 * is load-bearing for the corpus's noise scenario (N11 / M-200..M-203).
 *
 * Gated messages never reach the extractor at all — this is what "gated
 * pre-extraction" in GOLD_LABELS.md means.
 */

import type { CastEntry, Message } from "./types.ts";

export type GateRule = "G1_bot_author" | "G2_automation_address" | "G3_gated_channel" | "G4_automation_signature" | "G5_social_short";

export interface GateResult {
  gated: boolean;
  /** Every rule that fired, in order. Empty when the message passes (G6). */
  rulesFired: GateRule[];
}

const GATED_CHANNELS = new Set(["#build-ci"]);

const AUTOMATION_ADDRESS_RE = /^(noreply|no-reply|newsletter|notifications?|donotreply)@/i;

const AUTOMATION_SIGNATURE_PATTERNS: RegExp[] = [
  /pipeline\s+#?\d+/i,
  /\bFAILED on branch\b/i,
  /\bPASSED on branch\b/i,
  /has a new review \(\d+ stars?\)/i,
  /^This week:/i,
];

/**
 * Strips emoji and punctuation, splits on whitespace. Used by G5 to measure
 * "is this a short social aside" without being fooled by an emoji making the
 * message look longer than it reads.
 */
function contentTokens(text: string): string[] {
  const stripped = text
    // Emoji and other pictographic symbols (rough but sufficient for this
    // corpus's register — "lunch? 🍛" style asides).
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  return stripped.split(/\s+/).filter(Boolean);
}

export function evaluateNoiseGate(message: Message, cast: readonly CastEntry[]): GateResult {
  const rulesFired: GateRule[] = [];
  const castByHandle = new Map(cast.map((c) => [c.handle, c]));

  // G1: known bot/automation author.
  const authorEntry = castByHandle.get(message.author);
  if (authorEntry?.is_bot) {
    rulesFired.push("G1_bot_author");
  }

  // G2: automation-shaped address, independent of the cast table (catches an
  // automation sender that was never added to cast.json).
  if (AUTOMATION_ADDRESS_RE.test(message.author)) {
    rulesFired.push("G2_automation_address");
  }

  // G3: known-noise channel.
  if (message.channel && GATED_CHANNELS.has(message.channel)) {
    rulesFired.push("G3_gated_channel");
  }

  // G4: text carries an automation signature regardless of who "sent" it.
  if (AUTOMATION_SIGNATURE_PATTERNS.some((re) => re.test(message.text))) {
    rulesFired.push("G4_automation_signature");
  }

  // G5: short social aside — no digits, no cast handle mention, <=3 content
  // tokens after stripping emoji/punctuation. Deliberately narrow: this will
  // also gate some legitimate short acknowledgements in filler ("noted!"),
  // which is an accepted precision/recall trade in the gate itself, reported
  // via counts.gated rather than hidden.
  const tokens = contentTokens(message.text);
  const mentionsHandle = cast.some((c) => message.text.includes(c.handle));
  const hasDigit = /\d/.test(message.text);
  if (tokens.length <= 3 && !hasDigit && !mentionsHandle) {
    rulesFired.push("G5_social_short");
  }

  return { gated: rulesFired.length > 0, rulesFired };
}
