/**
 * Zod schema for the extractor's raw output, before span validation or
 * referent resolution. `.strict()` throughout so extra keys the model
 * invents fail loudly at parse time rather than silently passing through
 * and masking a prompt/schema drift.
 */

import { z } from "zod";

export const ModalitySchema = z.enum(["assertion", "hedge", "proposal", "question", "reported"]);
export const PolaritySchema = z.enum(["positive", "negative"]);

export const ExtractedClaimSchema = z
  .object({
    referent: z.string().min(1).max(120),
    value: z.string().min(1).max(300),
    modality: ModalitySchema,
    polarity: PolaritySchema,
    attributed_to: z.string().nullable().default(null),
    source_span: z.string().min(3).max(400),
  })
  .strict();

export const ExtractionOutputSchema = z
  .object({
    claims: z.array(ExtractedClaimSchema).max(6),
  })
  .strict();

export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;
