/**
 * The confidence-gated adjudication escalation router. Concrete model
 * selection, not just prose: the primary binary adjudication call self-
 * reports a confidence when the prompt asks for it; when that number is
 * present and below this threshold, runAdjudicationPipeline (pipeline.ts)
 * issues a second call using the BINARY_ESCALATED_SYSTEM prompt variant
 * (src/core/prompts/adjudication.ts), which asks for step-by-step reasoning
 * before the verdict. Both calls land in the trace, so escalation is
 * visible in the drill-down, not just asserted.
 *
 * Fixed, not tuned per-scenario or after seeing eval results — see the
 * build plan. Exported as its own constant (rather than inlined in
 * pipeline.ts) so it has one definition site and can be asserted on
 * directly by the router unit test.
 */
export const ESCALATION_CONFIDENCE_THRESHOLD = 0.6;

/** True when a primary-pass confidence should trigger the escalated call. */
export function shouldEscalate(confidence: number | undefined): boolean {
  return confidence !== undefined && confidence < ESCALATION_CONFIDENCE_THRESHOLD;
}
