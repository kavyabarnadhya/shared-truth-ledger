/**
 * ModelClient implementations. `ReplayModelClient` is what every mode
 * ultimately falls back to for reproducibility — it is the client the CLI
 * eval harness and the browser Evals tab both construct from the same
 * committed recordings, which is what makes their numbers identical.
 *
 * `StubModelClient` exists so the eval harness, both graders, and the
 * pipeline's wiring can be built and tested end-to-end before any real
 * model call — live or recorded — exists. This is CP-A in the build plan:
 * everything works with zero model calls.
 *
 * NOTE: no constructor in this file uses TypeScript parameter properties
 * (`constructor(private readonly x: T)`). Node's `--experimental-strip-types`
 * is a strip-ONLY transform — it deletes type syntax but does not compile
 * away language features, and parameter properties are a real code-generating
 * TS feature (they implicitly assign `this.x = x`), not erasable syntax. That
 * makes them throw `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` under `node
 * --experimental-strip-types`, which is exactly how `npm test`, `npm run
 * eval`, and every `scripts/*.ts` file run — so this would break for every
 * reviewer, not just in bundled/transpiled contexts. Every class below
 * declares fields explicitly and assigns them in the constructor body instead.
 */

import type {
  ModelClient,
  ModelConfig,
  ModelRequest,
  ModelResponse,
  RecordedCall,
  RecordingStore,
  RunMode,
  TraceEntry,
} from "../types.ts";
import { computeCacheKey, promptSha } from "./cache-key.ts";

/**
 * A trivial counter, but deliberately instantiated per-client rather than
 * module-global: a module-global counter would carry state between
 * unrelated pipeline runs in the same process (e.g. the browser calling
 * runEval() twice without a reload, or two eval configs run back-to-back in
 * one `node` process), which would make trace ids — and anything that
 * sorted by them — depend on call history rather than on the run itself.
 * Each ReplayModelClient/StubModelClient owns its own sequence.
 */
class TraceSequence {
  private seq = 0;
  next(step: string): string {
    this.seq += 1;
    return `${step}#${this.seq}`;
  }
}

export class ReplayMissError extends Error {
  readonly cacheKey: string;
  readonly step: string;
  readonly configId: string;

  constructor(cacheKey: string, step: string, configId: string) {
    super(
      `Replay miss: no recording for key ${cacheKey} (step="${step}", config="${configId}"). ` +
        `Replay never falls back to a live call silently — record this call with \`npm run record\` ` +
        `or switch to live mode.`,
    );
    this.name = "ReplayMissError";
    this.cacheKey = cacheKey;
    this.step = step;
    this.configId = configId;
  }
}

export class PromptDriftError extends Error {
  constructor(cacheKey: string) {
    super(
      `Recording ${cacheKey} is stale: the prompt this key would render today does not match the ` +
        `promptSha stored when it was recorded. Re-record rather than silently replaying a mismatched prompt.`,
    );
    this.name = "PromptDriftError";
  }
}

function costUsd(config: ModelConfig, req: ModelRequest, usage: ModelResponse["usage"]): number | null {
  const pricing = config.pricing[req.tier];
  if (!pricing || (pricing.inPerM === 0 && pricing.outPerM === 0)) return null;
  return (usage.inputTokens / 1_000_000) * pricing.inPerM + (usage.outputTokens / 1_000_000) * pricing.outPerM;
}

/**
 * Replays from a committed RecordingStore. This is the default client and
 * the ONLY client the eval harness (CLI or browser) ever constructs — live
 * calls happen only behind explicit API routes (see src/server/live-client.ts),
 * never inside anything graded.
 */
export class ReplayModelClient implements ModelClient {
  readonly mode: RunMode = "replay";
  readonly config: ModelConfig;
  private readonly recordings: RecordingStore;
  private readonly promptVersion: number;
  private readonly traceSeq = new TraceSequence();

  constructor(config: ModelConfig, recordings: RecordingStore, promptVersion: number) {
    this.config = config;
    this.recordings = recordings;
    this.promptVersion = promptVersion;
  }

  async call(req: ModelRequest): Promise<{ response: ModelResponse; trace: TraceEntry }> {
    const cacheKey = computeCacheKey({
      v: 1,
      tier: req.tier,
      model: req.model,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      promptVersion: req.promptVersion ?? this.promptVersion,
      judgeScope: req.judgeScope ?? null,
      system: req.system,
      inputKey: req.inputKey,
    });

    const recorded = this.recordings.get(cacheKey);
    if (!recorded) {
      throw new ReplayMissError(cacheKey, req.step, this.config.id);
    }

    const freshPromptSha = promptSha(req.system, req.user);
    if (recorded.promptSha !== freshPromptSha) {
      throw new PromptDriftError(cacheKey);
    }

    const trace: TraceEntry = {
      id: this.traceSeq.next(req.step),
      step: req.step,
      kind: "model",
      tier: req.tier,
      model: req.model,
      mode: "replay",
      cacheKey,
      cacheHit: true,
      tokensIn: recorded.response.usage.inputTokens,
      tokensOut: recorded.response.usage.outputTokens,
      latencyMs: recorded.latencyMs,
      costUsd: costUsd(this.config, req, recorded.response.usage),
      ok: true,
      promptRef: { system: req.system, user: req.user, schemaText: "" },
    };

    return { response: recorded.response, trace };
  }
}

/**
 * Deterministic, hand-scripted responses keyed by `req.step`. Used to build
 * and test the eval harness, both graders, and the pipeline's wiring before
 * any recording exists. Never used once real recordings land — the eval
 * harness always constructs a ReplayModelClient against
 * fixtures/recorded.generated.ts.
 */
export class StubModelClient implements ModelClient {
  readonly mode: RunMode = "replay";
  readonly config: ModelConfig;
  private readonly responsesByStep: ReadonlyMap<string, string>;
  private readonly defaultResponse: string;
  private readonly traceSeq = new TraceSequence();

  constructor(config: ModelConfig, responsesByStep: ReadonlyMap<string, string>, defaultResponse = "{}") {
    this.config = config;
    this.responsesByStep = responsesByStep;
    this.defaultResponse = defaultResponse;
  }

  async call(req: ModelRequest): Promise<{ response: ModelResponse; trace: TraceEntry }> {
    const text = this.responsesByStep.get(req.step) ?? this.defaultResponse;
    const usage = { inputTokens: req.system.length + req.user.length, outputTokens: text.length };
    const response: ModelResponse = { text, usage, finishReason: "stop" };
    const trace: TraceEntry = {
      id: this.traceSeq.next(req.step),
      step: req.step,
      kind: "model",
      tier: req.tier,
      model: req.model,
      mode: "replay",
      cacheKey: null,
      cacheHit: null,
      tokensIn: usage.inputTokens,
      tokensOut: usage.outputTokens,
      latencyMs: 0,
      costUsd: null,
      ok: true,
      promptRef: { system: req.system, user: req.user, schemaText: "" },
    };
    return { response, trace };
  }
}

/** In-memory RecordingStore used by tests and by the record script's dry-run mode. */
export class InMemoryRecordingStore implements RecordingStore {
  private readonly byKey = new Map<string, RecordedCall>();

  constructor(seed: readonly RecordedCall[] = []) {
    for (const call of seed) this.byKey.set(call.key, call);
  }

  get(key: string): RecordedCall | undefined {
    return this.byKey.get(key);
  }
  has(key: string): boolean {
    return this.byKey.has(key);
  }
  keys(): string[] {
    return [...this.byKey.keys()].sort();
  }
  async put(call: RecordedCall): Promise<void> {
    this.byKey.set(call.key, call);
  }
}
