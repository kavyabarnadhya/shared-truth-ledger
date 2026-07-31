import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runEval } from "./run-eval.ts";
import { SCENARIOS, CONTESTED_REFERENTS } from "./scenarios.ts";
import { runExtractionPipeline, runAdjudicationPipeline } from "../pipeline.ts";
import { StubModelClient, InMemoryRecordingStore } from "../model/client.ts";
import { computeCacheKey, promptSha } from "../model/cache-key.ts";
import { FREE_CONFIG } from "../model/config.ts";
import { EXTRACTION_PROMPT } from "../prompts/extraction.ts";
import { PROMPT_VERSION as ADJUDICATION_PROMPT_VERSION, ADJUDICATION_PROMPT } from "../prompts/adjudication.ts";
import type { CastEntry, GoldClaim, Message, RecordedCall, ModelRequest } from "../types.ts";

/**
 * CP-A per the build plan: "everything above works with zero model calls."
 *
 * `StubModelClient` returns canned, schema-valid responses instead of a real
 * recording. To prove `runEval`'s REAL replay path (the one the CLI and
 * browser actually use) works end-to-end without any real model, this file
 * first runs the pipeline once against StubModelClient to CAPTURE what it
 * would have recorded (same shape scripts/record.ts produces later), then
 * feeds those synthetic recordings into a real `ReplayModelClient` via
 * `runEval`. This is not testing StubModelClient's own trivial behavior —
 * it is testing that the harness's plumbing (scenario registry, both
 * graders, bucket assembly, headline computation, reportHash) is correct
 * BEFORE any real model quality is in the picture at all.
 */

const ROOT = join(import.meta.dirname, "..", "..", "..");
const corpus = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/messages.json"), "utf8")).messages as Message[];
const cast = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/cast.json"), "utf8")).cast as CastEntry[];
const goldClaims = JSON.parse(readFileSync(join(ROOT, "evals/gold-claims.json"), "utf8")).claims as GoldClaim[];

/**
 * Runs the extraction + adjudication pipelines once against a
 * StubModelClient wired to always answer "COMPATIBLE" / empty extraction,
 * capturing a RecordedCall for every request it sees (mirroring what
 * scripts/record.ts does against a live model). Returns a populated
 * InMemoryRecordingStore a real ReplayModelClient can then replay from.
 */
async function buildSyntheticRecordings(): Promise<InMemoryRecordingStore> {
  const store = new InMemoryRecordingStore();

  class CapturingStub extends StubModelClient {
    override async call(req: ModelRequest) {
      const result = await super.call(req);
      const key = computeCacheKey({
        v: 1,
        tier: req.tier,
        model: req.model,
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
        promptVersion: req.tier === "extraction" ? EXTRACTION_PROMPT.PROMPT_VERSION : ADJUDICATION_PROMPT_VERSION,
        judgeScope: req.judgeScope ?? null,
        system: req.system,
        inputKey: req.inputKey,
      });
      const recorded: RecordedCall = {
        key,
        tier: req.tier,
        model: req.model,
        configId: FREE_CONFIG.id,
        judgeScope: req.judgeScope ?? null,
        step: req.step,
        promptSha: promptSha(req.system, req.user),
        request: { system: req.system, user: req.user, temperature: req.temperature, maxOutputTokens: req.maxOutputTokens },
        response: result.response,
        latencyMs: 1,
        recordedAt: "2026-07-24T23:59:59+05:30" as import("../time.ts").Instant,
      };
      await store.put(recorded);
      return result;
    }
  }

  const extractionModel = new CapturingStub(FREE_CONFIG, new Map(), '{"claims":[]}');
  await runExtractionPipeline(corpus, cast, extractionModel);

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

  const distinctAsOfs = new Set<string>();
  for (const s of SCENARIOS) for (const b of s.buckets) distinctAsOfs.add(b.asOf);
  for (const asOf of distinctAsOfs) {
    const adjModel = new CapturingStub(
      FREE_CONFIG,
      new Map(),
      '{"verdict":"COMPATIBLE","rationale":"stub always compatible","conflicting_claim_ids":[]}',
    );
    await runAdjudicationPipeline(
      goldAsClaims, messagesById, cast, CONTESTED_REFERENTS,
      asOf as import("../time.ts").Instant, "binary", adjModel,
    );
  }

  return store;
}

test("CP-A: runEval's real replay path completes end-to-end against synthetic (stub-captured) recordings, zero live model calls", async () => {
  const recordings = await buildSyntheticRecordings();
  const report = await runEval({
    corpus, cast, gold: { claims: goldClaims }, recordings,
    config: FREE_CONFIG, judgeScope: "binary",
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.configId, "free");
  assert.equal(report.judgeScope, "binary");
  assert.equal(report.mode, "replay");
  assert.ok(report.extraction.length > 0);
  assert.ok(report.adjudication.length > 0);
  assert.ok(report.contested.length > 0);
});

test("CP-A: the flagship bucket (N2) is RESOLVED_BY_SUPERSESSION purely from pre-rules, even though the stub model always says COMPATIBLE", async () => {
  const recordings = await buildSyntheticRecordings();
  const report = await runEval({
    corpus, cast, gold: { claims: goldClaims }, recordings,
    config: FREE_CONFIG, judgeScope: "binary",
  });
  const n2 = report.adjudication.find((a) => a.scenario === "N2")!;
  assert.ok(n2);
  assert.equal(n2.buckets[0]!.expected, "RESOLVED_BY_SUPERSESSION");
  assert.equal(n2.buckets[0]!.actual, "RESOLVED_BY_SUPERSESSION");
  assert.equal(n2.buckets[0]!.correct, true);
  assert.equal(n2.buckets[0]!.decidedBy, "pre_rule");
});

test("CP-A: N1 (self-revision -> UPDATE) is correct purely from pre-rules regardless of the stub model", async () => {
  const recordings = await buildSyntheticRecordings();
  const report = await runEval({
    corpus, cast, gold: { claims: goldClaims }, recordings,
    config: FREE_CONFIG, judgeScope: "binary",
  });
  const n1 = report.adjudication.find((a) => a.scenario === "N1")!;
  assert.equal(n1.buckets[0]!.actual, "UPDATE");
  assert.equal(n1.buckets[0]!.correct, true);
});

test("CP-A: headline false-positive-rate denominator is fixed at 18 regardless of model behavior", async () => {
  const recordings = await buildSyntheticRecordings();
  const report = await runEval({
    corpus, cast, gold: { claims: goldClaims }, recordings,
    config: FREE_CONFIG, judgeScope: "binary",
  });
  assert.equal(report.headline.falsePositiveRate.mustNotFlagTotal, 18);
});

test("CP-A: C9 is excluded from the headline adjudication set and reported separately in `contested`", async () => {
  const recordings = await buildSyntheticRecordings();
  const report = await runEval({
    corpus, cast, gold: { claims: goldClaims }, recordings,
    config: FREE_CONFIG, judgeScope: "binary",
  });
  assert.ok(!report.adjudication.some((a) => a.scenario === "C9"));
  assert.ok(report.contested.some((a) => a.scenario === "C9"));
});

test("CP-A: runEval is deterministic across two runs against the same recordings", async () => {
  const recordings = await buildSyntheticRecordings();
  const a = await runEval({ corpus, cast, gold: { claims: goldClaims }, recordings, config: FREE_CONFIG, judgeScope: "binary" });
  const b = await runEval({ corpus, cast, gold: { claims: goldClaims }, recordings, config: FREE_CONFIG, judgeScope: "binary" });
  assert.equal(a.reportHash, b.reportHash);
});

test("CP-A: runEval throws ReplayMissError (not a silent report) when a recording is genuinely missing", async () => {
  const emptyStore = new InMemoryRecordingStore();
  await assert.rejects(() =>
    runEval({ corpus, cast, gold: { claims: goldClaims }, recordings: emptyStore, config: FREE_CONFIG, judgeScope: "binary" }),
  );
});

void ADJUDICATION_PROMPT; // referenced for documentation purposes in this file's header comment
