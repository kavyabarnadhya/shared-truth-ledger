/**
 * `npm run freeze:baseline` — runs the eval suite in replay mode and writes
 * the result to evals/baseline.json, committed to git. Every subsequent
 * `npm run eval` diffs against this file and exits non-zero on any single-
 * scenario regression, per the protocol: an improving average with one
 * regressed scenario is a failure, not a win. Only ever rewritten by this
 * explicit command — never implicitly by `npm run eval` itself.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runEval } from "../src/core/eval/run-eval.ts";
import { getConfig } from "../src/core/model/config.ts";
import { InMemoryRecordingStore } from "../src/core/model/client.ts";
import type { CastEntry, GoldClaim, Message, RecordedCall } from "../src/core/types.ts";

const ROOT = join(import.meta.dirname, "..");

function loadRecordings(): InMemoryRecordingStore {
  const store = new InMemoryRecordingStore();
  for (const tier of ["extraction", "adjudication", "embedding"] as const) {
    const dir = join(ROOT, "fixtures", "recorded", tier);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const call = JSON.parse(readFileSync(join(dir, file), "utf8")) as RecordedCall;
      store.put(call);
    }
  }
  return store;
}

async function main(): Promise<void> {
  const corpus = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/messages.json"), "utf8")).messages as Message[];
  const cast = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/cast.json"), "utf8")).cast as CastEntry[];
  const goldClaims = JSON.parse(readFileSync(join(ROOT, "evals/gold-claims.json"), "utf8")).claims as GoldClaim[];
  const recordings = loadRecordings();
  const config = getConfig("free");

  const report = await runEval({ corpus, cast, gold: { claims: goldClaims }, recordings, config, judgeScope: "binary" });

  const path = join(ROOT, "evals", "baseline.json");
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`Wrote ${path}`);
  console.log(`reportHash: ${report.reportHash}`);
  console.log(`False positive rate: ${report.headline.falsePositiveRate.flagged}/${report.headline.falsePositiveRate.mustNotFlagTotal}`);
  console.log(`Contradiction recall: ${report.headline.contradictionRecall.found}/${report.headline.contradictionRecall.total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
