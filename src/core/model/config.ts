/**
 * Named model configurations. `free` is the only one with committed
 * recordings — every number in the README comes from it. `strong` exists so
 * the two-tier ModelClient interface is real (swapping adjudication to a
 * stronger model is a one-line change here), but it is deliberately left
 * unrecorded: no strong-model numbers are claimed because none were run.
 */

import type { ModelConfig } from "../types.ts";

export const FREE_CONFIG: ModelConfig = {
  id: "free",
  label: "inclusionai/ling-3.0-flash-free (both tiers)",
  models: {
    extraction: "inclusionai/ling-3.0-flash-free",
    adjudication: "inclusionai/ling-3.0-flash-free",
    embedding: "inclusionai/ling-3.0-flash-free",
  },
  temperature: 0,
  maxOutputTokens: 800,
  pricing: {
    extraction: { inPerM: 0, outPerM: 0 },
    adjudication: { inPerM: 0, outPerM: 0 },
    embedding: { inPerM: 0, outPerM: 0 },
  },
};

/**
 * The paid-tier swap-in — documented, not run. For this assignment every
 * recorded number, including the confidence-gated escalation rung added on
 * top of the primary binary adjudication call (see router.ts and
 * pipeline.ts's runAdjudicationPipeline), stays on the free model. No real
 * call to `anthropic/claude-sonnet-5` is made or claimed anywhere in this
 * build. Swapping `adjudication` to it here — for either or both rungs — is
 * the one-line production change this config exists to demonstrate. No
 * recordings exist for this config; replay mode fails loudly ("no
 * recordings for config 'strong'") rather than silently falling back to
 * `free`'s recordings.
 */
export const STRONG_CONFIG: ModelConfig = {
  id: "strong",
  label: "anthropic/claude-sonnet-5 (adjudication only, extraction stays free)",
  models: {
    extraction: "inclusionai/ling-3.0-flash-free",
    adjudication: "anthropic/claude-sonnet-5",
    embedding: "inclusionai/ling-3.0-flash-free",
  },
  temperature: 0,
  maxOutputTokens: 800,
  pricing: {
    extraction: { inPerM: 0, outPerM: 0 },
    // Anthropic list pricing as of this build; used only for the trace's
    // cost column if this config is ever actually recorded and run.
    adjudication: { inPerM: 3, outPerM: 15 },
    embedding: { inPerM: 0, outPerM: 0 },
  },
};

export const CONFIGS: Record<string, ModelConfig> = {
  free: FREE_CONFIG,
  strong: STRONG_CONFIG,
};

export function getConfig(id: string): ModelConfig {
  const config = CONFIGS[id];
  if (!config) {
    throw new Error(`Unknown model config "${id}". Known configs: ${Object.keys(CONFIGS).join(", ")}`);
  }
  return config;
}
