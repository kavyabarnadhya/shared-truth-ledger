/**
 * The only ModelClient implementation that makes a real network call. Lives
 * under src/server/ — never imported by src/core/**, src/lib/**, or any
 * client component — because the gateway key is read from
 * process.env.AI_GATEWAY_API_KEY here and must never reach a client bundle.
 *
 * Used by `npm run record` (writes what it gets to fixtures/recorded/**) and
 * by the live-mode API routes (which never write; see the mode table in
 * model/client.ts's doc comment). Every other code path — the eval harness,
 * the Evals tab, the Contradictions/Ledger tabs in their default state —
 * uses ReplayModelClient exclusively.
 *
 * Talks to the Vercel AI Gateway's OpenAI-compatible chat completions
 * endpoint via plain fetch. No `ai`/`@ai-sdk/*` dependency: replay/record
 * needs to intercept the exact request/response shape, and a raw fetch call
 * is the simplest thing that keeps that fully under our control.
 */

import type { ModelClient, ModelConfig, ModelRequest, ModelResponse, RunMode, TraceEntry } from "../core/types.ts";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

export class LiveModelCallError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "LiveModelCallError";
    this.status = status;
  }
}

let traceCounter = 0;
function nextTraceId(step: string): string {
  traceCounter += 1;
  return `${step}#live#${traceCounter}`;
}

function costUsd(config: ModelConfig, req: ModelRequest, usage: ModelResponse["usage"]): number | null {
  const pricing = config.pricing[req.tier];
  if (!pricing || (pricing.inPerM === 0 && pricing.outPerM === 0)) return null;
  return (usage.inputTokens / 1_000_000) * pricing.inPerM + (usage.outputTokens / 1_000_000) * pricing.outPerM;
}

export class LiveModelClient implements ModelClient {
  readonly mode: RunMode = "live";
  readonly config: ModelConfig;
  private readonly apiKey: string;

  constructor(config: ModelConfig, apiKey: string) {
    this.config = config;
    this.apiKey = apiKey;
  }

  async call(req: ModelRequest): Promise<{ response: ModelResponse; trace: TraceEntry }> {
    const startedAtMs = Date.now();

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        temperature: req.temperature,
        max_tokens: req.maxOutputTokens,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      }),
    });

    const latencyMs = Date.now() - startedAtMs;

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new LiveModelCallError(`AI Gateway call failed (${res.status}): ${body.slice(0, 500)}`, res.status);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = json.choices?.[0]?.message?.content ?? "";
    const finishReason = json.choices?.[0]?.finish_reason ?? "unknown";
    const usage = {
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };

    const response: ModelResponse = { text, usage, finishReason };
    const trace: TraceEntry = {
      id: nextTraceId(req.step),
      step: req.step,
      kind: "model",
      tier: req.tier,
      model: req.model,
      mode: "live",
      cacheKey: null,
      cacheHit: false,
      tokensIn: usage.inputTokens,
      tokensOut: usage.outputTokens,
      latencyMs,
      costUsd: costUsd(this.config, req, usage),
      ok: true,
      promptRef: { system: req.system, user: req.user, schemaText: "" },
    };

    return { response, trace };
  }
}

/**
 * Reads the gateway key from the server-only environment. Throws rather
 * than returning undefined so a misconfigured deployment fails at the call
 * site with a clear message instead of silently trying to fetch with
 * "Bearer undefined".
 */
export function getGatewayApiKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
    throw new Error(
      "AI_GATEWAY_API_KEY is not set. Live mode and `npm run record` both require it; replay mode does not.",
    );
  }
  return key;
}
