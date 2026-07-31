/**
 * Bounded JSON repair ladder for free-tier model output, which is often
 * markdown-fenced, has trailing commas, or wraps/unwraps the expected
 * top-level shape. Five deterministic steps, no LLM-based repair, no retry-
 * with-different-prompt, no schema coercion of enum values. Each step that
 * fires is recorded so the drill-down can show exactly what was tolerated.
 *
 * A parse failure here means zero claims for that message (extraction) or a
 * `fallback` COMPATIBLE verdict (adjudication) — both deliberately
 * conservative outcomes that can only hurt recall, never inflate the
 * headline false-positive rate. See pipeline.ts's catch sites.
 */

import { ExtractionOutputSchema, type ExtractedClaim } from "../schema/claim.ts";
import { BinaryVerdictSchema, Full7VerdictSchema } from "../schema/verdict.ts";
import type { JudgeScope, VerdictKind } from "../types.ts";

export interface RepairAttempt {
  step: string;
  text: string;
}

/**
 * Runs the repair ladder and returns the first candidate string that
 * `JSON.parse`s successfully, along with which steps fired to get there.
 * Returns null if every step fails.
 */
export function repairJson(raw: string): { parsed: unknown; stepsFired: string[] } | null {
  const stepsFired: string[] = [];
  let candidate = raw;

  // Step 1: parse as-is.
  const direct = tryParse(candidate);
  if (direct.ok) return { parsed: direct.value, stepsFired };

  // Step 2: strip markdown code fences.
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(candidate);
  if (fenceMatch) {
    candidate = fenceMatch[1]!;
    stepsFired.push("strip_markdown_fences");
    const afterFence = tryParse(candidate);
    if (afterFence.ok) return { parsed: afterFence.value, stepsFired };
  }

  // Step 3: extract the outermost balanced {...} or [...] by string-aware
  // brace/bracket counting, in case there's leading/trailing prose.
  const extracted = extractOutermostBalanced(candidate);
  if (extracted) {
    candidate = extracted;
    stepsFired.push("extract_outermost_balanced");
    const afterExtract = tryParse(candidate);
    if (afterExtract.ok) return { parsed: afterExtract.value, stepsFired };
  }

  // Step 4: drop trailing commas before } or ].
  const noTrailingCommas = candidate.replace(/,(\s*[}\]])/g, "$1");
  if (noTrailingCommas !== candidate) {
    candidate = noTrailingCommas;
    stepsFired.push("drop_trailing_commas");
    const afterCommaFix = tryParse(candidate);
    if (afterCommaFix.ok) return { parsed: afterCommaFix.value, stepsFired };
  }

  // Step 5: wrap/unwrap between a bare array and {claims:[...]}. Applied
  // last since it needs a value to have actually parsed by now to inspect.
  const lastAttempt = tryParse(candidate);
  if (lastAttempt.ok) {
    if (Array.isArray(lastAttempt.value)) {
      stepsFired.push("wrap_array_as_claims_object");
      return { parsed: { claims: lastAttempt.value }, stepsFired };
    }
  }

  return null;
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function extractOutermostBalanced(text: string): string | null {
  const openers = new Set(["{", "["]);
  const closers: Record<string, string> = { "{": "}", "[": "]" };
  let start = -1;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (openers.has(ch)) {
      if (start === -1) start = i;
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      const top = stack.pop();
      if (top && closers[top] === ch && stack.length === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export type ExtractionParseResult =
  | { ok: true; claims: ExtractedClaim[]; repairSteps: string[] }
  | { ok: false; error: string; repairSteps: string[] };

export function parseExtractionResponse(rawText: string): ExtractionParseResult {
  const repaired = repairJson(rawText);
  if (!repaired) {
    return { ok: false, error: "no repair step produced valid JSON", repairSteps: [] };
  }
  const validated = ExtractionOutputSchema.safeParse(repaired.parsed);
  if (!validated.success) {
    return {
      ok: false,
      error: `schema validation failed: ${validated.error.issues.map((i) => i.message).join("; ")}`,
      repairSteps: repaired.stepsFired,
    };
  }
  return { ok: true, claims: validated.data.claims, repairSteps: repaired.stepsFired };
}

// ---------------------------------------------------------------------------
// Adjudication
// ---------------------------------------------------------------------------

export type AdjudicationParseResult =
  | { ok: true; verdict: VerdictKind; rationale: string; conflictingClaimIds: string[]; repairSteps: string[] }
  | { ok: false; error: string; repairSteps: string[] };

export function parseAdjudicationResponse(rawText: string, judgeScope: JudgeScope): AdjudicationParseResult {
  const repaired = repairJson(rawText);
  if (!repaired) {
    return { ok: false, error: "no repair step produced valid JSON", repairSteps: [] };
  }
  const schema = judgeScope === "binary" ? BinaryVerdictSchema : Full7VerdictSchema;
  const validated = schema.safeParse(repaired.parsed);
  if (!validated.success) {
    return {
      ok: false,
      error: `schema validation failed: ${validated.error.issues.map((i) => i.message).join("; ")}`,
      repairSteps: repaired.stepsFired,
    };
  }
  return {
    ok: true,
    verdict: validated.data.verdict as VerdictKind,
    rationale: validated.data.rationale,
    conflictingClaimIds: validated.data.conflicting_claim_ids,
    repairSteps: repaired.stepsFired,
  };
}
