/**
 * `npm run record` — runs the full pipeline in RECORD mode: real calls to
 * the AI Gateway, written to fixtures/recorded/**. This is the only script
 * in the repo that spends money (free tier here, so $0, but the mechanism
 * is the same one that would spend real money against a paid model).
 *
 * Idempotent and resumable: skips any cache key that already has a file on
 * disk, so a mid-run failure (quota, network) can simply be re-run and
 * picks up where it left off rather than re-spending on already-recorded
 * calls.
 *
 * Records BOTH judge scopes (binary, full7) for adjudication, since the
 * judge-scope comparison is a first-class recorded configuration per the
 * build plan, not an afterthought.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runExtractionPipeline, runAdjudicationPipeline } from "../src/core/pipeline.ts";
import { SCENARIOS, CONTESTED_REFERENTS } from "../src/core/eval/scenarios.ts";
import { LiveModelClient, getGatewayApiKey } from "../src/server/live-client.ts";
import { computeCacheKey, promptSha } from "../src/core/model/cache-key.ts";
import { getConfig } from "../src/core/model/config.ts";
import { EXTRACTION_PROMPT } from "../src/core/prompts/extraction.ts";
import { PROMPT_VERSION as ADJUDICATION_PROMPT_VERSION } from "../src/core/prompts/adjudication.ts";
import { EVAL_AS_OF_DEFAULT, parseInstant } from "../src/core/time.ts";
import type { CastEntry, GoldClaim, Message, ModelClient, ModelRequest, ModelResponse, RecordedCall, TraceEntry, JudgeScope, Instant } from "../src/core/types.ts";

const ROOT = join(import.meta.dirname, "..");
const RECORDED_DIR = join(ROOT, "fixtures", "recorded");

interface RecordingSink {
  has(key: string): boolean;
  put(call: RecordedCall): Promise<void>;
}

/** Writes/reads recordings directly to/from fixtures/recorded/<tier>/<key>.json. */
class FsRecordingSink implements RecordingSink {
  private readonly seen = new Set<string>();

  constructor() {
    for (const tier of ["extraction", "adjudication", "embedding"] as const) {
      const dir = join(RECORDED_DIR, tier);
      if (!existsSync(dir)) continue;
      for (const file of readdirSyncSafe(dir)) {
        if (file.endsWith(".json")) this.seen.add(file.replace(/\.json$/, ""));
      }
    }
  }

  has(key: string): boolean {
    return this.seen.has(key);
  }

  async put(call: RecordedCall): Promise<void> {
    const dir = join(RECORDED_DIR, call.tier);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${call.key}.json`), JSON.stringify(call, null, 2) + "\n", "utf8");
    this.seen.add(call.key);
  }
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const INTER_CALL_DELAY_MS = 6000;

/**
 * Retries a live call up to 4 times with exponential backoff (2s, 4s, 8s,
 * 16s) on a 429 or 5xx — the free-tier gateway model rate-limits per model,
 * and a single retry ladder here is much simpler than threading retry logic
 * through every call site. Any other error (4xx that isn't 429, a genuine
 * network failure) is NOT retried and propagates immediately, since retrying
 * a malformed request would just waste quota repeating the same mistake.
 */
async function callWithRetry(
  live: LiveModelClient,
  req: ModelRequest,
): Promise<{ response: ModelResponse; trace: TraceEntry }> {
  const delays = [10000, 20000, 40000, 60000, 90000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await live.call(req);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const isRetryable = status === 429 || (typeof status === "number" && status >= 500);
      if (!isRetryable || attempt === delays.length) throw err;
      const delay = delays[attempt]!;
      console.log(`    (retrying after ${delay}ms: ${err instanceof Error ? err.message : String(err)})`);
      await sleep(delay);
    }
  }
  throw new Error("unreachable");
}

/** A ModelClient that records real calls through a live client, skipping any key already on disk. */
class RecordingModelClient implements ModelClient {
  readonly mode = "record" as const;
  readonly config: import("../src/core/types.ts").ModelConfig;
  private readonly live: LiveModelClient;
  private readonly sink: RecordingSink;
  private readonly promptVersion: number;
  recorded = 0;
  skipped = 0;

  constructor(live: LiveModelClient, sink: RecordingSink, promptVersion: number) {
    this.config = live.config;
    this.live = live;
    this.sink = sink;
    this.promptVersion = promptVersion;
  }

  async call(req: ModelRequest): Promise<{ response: ModelResponse; trace: TraceEntry }> {
    const key = computeCacheKey({
      v: 1,
      tier: req.tier,
      model: req.model,
      temperature: req.temperature,
      maxOutputTokens: req.maxOutputTokens,
      promptVersion: this.promptVersion,
      judgeScope: req.judgeScope ?? null,
      system: req.system,
      inputKey: req.inputKey,
    });

    if (this.sink.has(key)) {
      this.skipped++;
      // Still need to RETURN something so the pipeline can proceed on a
      // resumed run without re-spending — read the existing file back.
      const dir = join(RECORDED_DIR, req.tier);
      const existing = JSON.parse(readFileSync(join(dir, `${key}.json`), "utf8")) as RecordedCall;
      return {
        response: existing.response,
        trace: {
          id: `${req.step}#skip`,
          step: req.step,
          kind: "model" as const,
          tier: req.tier,
          model: req.model,
          mode: "replay" as const,
          cacheKey: key,
          cacheHit: true,
          tokensIn: existing.response.usage.inputTokens,
          tokensOut: existing.response.usage.outputTokens,
          latencyMs: existing.latencyMs,
          costUsd: null,
          ok: true,
        },
      };
    }

    console.log(`  recording: ${req.step} (${req.tier}, judgeScope=${req.judgeScope ?? "n/a"})`);
    // A fixed gap BEFORE every real call, not just retry backoff after a
    // failure: the free-tier gateway appears to allow only a small burst
    // before rate-limiting (observed: ~1 call succeeds back-to-back, then
    // 429s persist well past a 30s total backoff window). Pacing every call
    // is slower but far less likely to trip the limit in the first place.
    await sleep(INTER_CALL_DELAY_MS);
    const { response, trace } = await callWithRetry(this.live, req);
    const recorded: RecordedCall = {
      key,
      tier: req.tier,
      model: req.model,
      configId: this.config.id,
      judgeScope: req.judgeScope ?? null,
      step: req.step,
      promptSha: promptSha(req.system, req.user),
      request: { system: req.system, user: req.user, temperature: req.temperature, maxOutputTokens: req.maxOutputTokens },
      response,
      latencyMs: trace.latencyMs,
      recordedAt: new Date().toISOString().replace("Z", "+00:00") as Instant, // record-time only; never used by graded logic
    };
    await this.sink.put(recorded);
    this.recorded++;
    return { response, trace };
  }
}

async function main(): Promise<void> {
  const configId = process.argv.includes("--config=strong") ? "strong" : "free";
  const config = getConfig(configId);
  const apiKey = getGatewayApiKey();

  const corpus = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/messages.json"), "utf8")).messages as Message[];
  const cast = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/cast.json"), "utf8")).cast as CastEntry[];
  const goldClaims = JSON.parse(readFileSync(join(ROOT, "evals/gold-claims.json"), "utf8")).claims as GoldClaim[];

  const sink = new FsRecordingSink();

  console.log(`Recording with config="${configId}"...`);
  console.log("");
  console.log("=== Extraction ===");
  const extractionLive = new LiveModelClient(config, apiKey);
  const extractionRecorder = new RecordingModelClient(extractionLive, sink, EXTRACTION_PROMPT.PROMPT_VERSION);
  const extractionResult = await runExtractionPipeline(corpus, cast, extractionRecorder);
  const extractionFailures = extractionResult.trace.filter((t) => t.ok === false);
  console.log(`Extraction: ${extractionRecorder.recorded} recorded, ${extractionRecorder.skipped} skipped (already on disk), ${extractionFailures.length} failed`);
  for (const f of extractionFailures) {
    console.log(`  FAILED: ${f.step}: ${f.error}`);
  }

  const messagesById = new Map(corpus.map((m) => [m.id, m]));
  const goldAsClaims = goldClaims.map((g) => {
    const m = messagesById.get(g.message_id)!;
    return {
      claim_id: g.claim_id, message_id: g.message_id, referent: g.referent, raw_referent: g.referent,
      predicate: "value" as const, value: g.value, raw_value: g.value, asserter: g.asserter,
      modality: g.modality, polarity: g.polarity, attributed_to: g.attributed_to,
      timestamp: m.timestamp, source_span: m.text, span_valid: true, span_offset: 0,
    };
  });

  const distinctAsOfs = new Set<Instant>();
  for (const s of SCENARIOS) for (const b of s.buckets) distinctAsOfs.add(b.asOf);

  for (const judgeScope of ["binary", "full7"] as JudgeScope[]) {
    console.log("");
    console.log(`=== Adjudication (judgeScope=${judgeScope}) ===`);
    const adjLive = new LiveModelClient(config, apiKey);
    const adjRecorder = new RecordingModelClient(adjLive, sink, ADJUDICATION_PROMPT_VERSION);
    let adjFailures = 0;
    for (const asOf of distinctAsOfs) {
      const result = await runAdjudicationPipeline(goldAsClaims, messagesById, cast, CONTESTED_REFERENTS, asOf, judgeScope, adjRecorder, true);
      for (const v of result.verdicts) {
        if (v.decidedBy === "fallback") {
          adjFailures++;
          console.log(`  FAILED: adjudicate ${v.bucket_key}@${asOf}: ${v.rationale}`);
        }
      }
    }
    console.log(`Adjudication (${judgeScope}): ${adjRecorder.recorded} recorded, ${adjRecorder.skipped} skipped (already on disk), ${adjFailures} failed`);
  }

  // The eval harness's adjudication grader is fed GOLD claims (recorded
  // above) so a bad extractor can't mask or manufacture adjudication
  // errors — that's the two-graders-never-merged design. But the live
  // Contradictions/Ledger tabs run adjudication on the EXTRACTOR's own
  // predicted claims, which naturally form different buckets (and hence
  // different cache keys) than the gold-claims run. Record that path too,
  // in binary scope, at every as-of the AsOfControl segmented control
  // exposes (src/components/AsOfControl.tsx's AS_OF_PRESETS) — not just the
  // frozen default. Only recording the default here left the flagship
  // 15Jul/18Jul transition demo (the one place the UI's as-of toggle is
  // meant to be exercised) with no live-app-path recording at all, which
  // surfaced as a live "No recording for this input" error on
  // indep_event.launch_date the first time a reviewer actually moved the
  // control off its default. These three literals are kept in sync with
  // AsOfControl.tsx's AS_OF_PRESETS by hand (that file is a "use client"
  // component and can't be imported into a plain Node script cleanly) —
  // if AsOfControl.tsx's presets ever change, update this list too.
  const LIVE_APP_AS_OFS = [
    parseInstant("2026-07-15T23:59:59+05:30"), // AsOfControl: "15 Jul"
    parseInstant("2026-07-18T23:59:59+05:30"), // AsOfControl: "18 Jul"
    EVAL_AS_OF_DEFAULT, // AsOfControl: "24 Jul (frozen)"
  ];
  console.log("");
  console.log(`=== Adjudication on EXTRACTOR's own claims (binary, all ${LIVE_APP_AS_OFS.length} AsOfControl presets — what the live app uses) ===`);
  const liveAppAdjLive = new LiveModelClient(config, apiKey);
  const liveAppAdjRecorder = new RecordingModelClient(liveAppAdjLive, sink, ADJUDICATION_PROMPT_VERSION);
  let liveAppFailures = 0;
  for (const liveAppAsOf of LIVE_APP_AS_OFS) {
    const liveAppResult = await runAdjudicationPipeline(
      extractionResult.claims, messagesById, cast, CONTESTED_REFERENTS, liveAppAsOf, "binary", liveAppAdjRecorder,
    );
    for (const v of liveAppResult.verdicts) {
      if (v.decidedBy === "fallback") {
        liveAppFailures++;
        console.log(`  FAILED: adjudicate ${v.bucket_key}@${liveAppAsOf}: ${v.rationale}`);
      }
    }
  }
  console.log(`Adjudication (live-app path, all as-ofs): ${liveAppAdjRecorder.recorded} recorded, ${liveAppAdjRecorder.skipped} skipped (already on disk), ${liveAppFailures} failed`);

  console.log("");
  console.log("Done. Run `npm run gen:bundles` to regenerate the committed bundle modules.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
