/**
 * Zod schema for the adjudicator's raw output. Two schemas, matching the
 * two judge scopes (prompts/adjudication.ts): `binary` only allows
 * CONTRADICTION and COMPATIBLE — the schema itself is what prevents the
 * model from emitting UPDATE, RESOLVED_BY_SUPERSESSION,
 * RESOLVED_BY_CORRECTION, or AMBIGUOUS_REFERENT, which are pre-rules' job.
 * `full7` allows the entire vocabulary, for the judge-scope comparison.
 *
 * `confidence` (binary scope only) is optional and self-reported by the
 * model, 0-1. It backs the confidence-gated escalation router in
 * pipeline.ts: when present and below ESCALATION_CONFIDENCE_THRESHOLD, a
 * second call is issued with the BINARY_ESCALATED_SYSTEM prompt variant
 * (still this same schema — escalation asks for more reasoning, not a
 * different output shape). Absent on older recordings and on full7, which
 * never asks for it.
 */

import { z } from "zod";

export const BinaryVerdictSchema = z
  .object({
    verdict: z.enum(["CONTRADICTION", "COMPATIBLE"]),
    rationale: z.string().max(400),
    conflicting_claim_ids: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export const Full7VerdictSchema = z
  .object({
    verdict: z.enum([
      "CONTRADICTION",
      "UPDATE",
      "RESOLVED_BY_SUPERSESSION",
      "RESOLVED_BY_CORRECTION",
      "AMBIGUOUS_REFERENT",
      "COMPATIBLE",
      "CONTESTED",
    ]),
    rationale: z.string().max(400),
    conflicting_claim_ids: z.array(z.string()).default([]),
  })
  .strict();

export type BinaryVerdictOutput = z.infer<typeof BinaryVerdictSchema>;
export type Full7VerdictOutput = z.infer<typeof Full7VerdictSchema>;
