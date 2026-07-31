/**
 * `npm run eval` — the offline, no-API-key reproduction path. Reads the
 * committed corpus and recordings from disk, calls the same `runEval` the
 * browser Evals tab calls, and prints a per-scenario table. Exits non-zero
 * when a baseline diff shows any regression, per the protocol: an average
 * that improves while a single scenario regresses is a failure.
 *
 * This script is Node-only (uses fs/path) — it is the one place allowed to
 * touch the filesystem before handing fully-loaded in-memory data to the
 * pure `runEval`.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runEval } from "../src/core/eval/run-eval.ts";
import { diffReports } from "../src/core/eval/diff.ts";
import { getConfig } from "../src/core/model/config.ts";
import { InMemoryRecordingStore } from "../src/core/model/client.ts";
import type { CastEntry, GoldClaim, Message, RecordedCall, JudgeScope } from "../src/core/types.ts";

const ROOT = join(import.meta.dirname, "..");

function parseArgs(argv: string[]): { mode: "replay" | "live"; configId: string; judgeScope: JudgeScope; diffScope: boolean; printHash: boolean } {
  let mode: "replay" | "live" = "replay";
  let configId = "free";
  let judgeScope: JudgeScope = "binary";
  let diffScope = false;
  let printHash = false;
  for (const arg of argv) {
    if (arg === "--mode=live") mode = "live";
    else if (arg.startsWith("--config=")) configId = arg.slice("--config=".length);
    else if (arg.startsWith("--judge-scope=")) judgeScope = arg.slice("--judge-scope=".length) as JudgeScope;
    else if (arg === "--diff-scope") diffScope = true;
    else if (arg === "--print-hash") printHash = true;
  }
  return { mode, configId, judgeScope, diffScope, printHash };
}

function loadRecordings(): InMemoryRecordingStore {
  const dir = join(ROOT, "fixtures", "recorded");
  const store = new InMemoryRecordingStore();
  if (!existsSync(dir)) return store;
  for (const tier of ["extraction", "adjudication", "embedding"]) {
    const tierDir = join(dir, tier);
    if (!existsSync(tierDir)) continue;
    for (const file of readdirSync(tierDir)) {
      if (!file.endsWith(".json")) continue;
      const call = JSON.parse(readFileSync(join(tierDir, file), "utf8")) as RecordedCall;
      store.put(call);
    }
  }
  return store;
}

function printScenarioTable(report: Awaited<ReturnType<typeof runEval>>): void {
  console.log("");
  console.log(`EVAL_AS_OF: ${report.evalAsOf}  |  config: ${report.configId}  |  judgeScope: ${report.judgeScope}  |  mode: ${report.mode}`);
  console.log(`reportHash: ${report.reportHash}`);
  console.log("");
  console.log("Adjudication (headline scenarios):");
  console.log("scenario | expected/actual per bucket | verdictAccuracy");
  for (const a of report.adjudication) {
    for (const b of a.buckets) {
      const mark = b.correct ? "OK" : "MISMATCH";
      const fp = b.falsePositive ? " [FALSE POSITIVE]" : "";
      console.log(`${a.scenario.padEnd(4)} ${b.bucket_key.padEnd(40)} expected=${b.expected.padEnd(24)} actual=${b.actual.padEnd(24)} ${mark}${fp}`);
    }
  }
  console.log("");
  console.log("Contested (excluded from headline):");
  for (const a of report.contested) {
    for (const b of a.buckets) {
      console.log(`${a.scenario.padEnd(4)} ${b.bucket_key.padEnd(40)} expected=${b.expected.padEnd(24)} actual=${b.actual}`);
    }
  }
  console.log("");
  console.log("Extraction (per scenario):");
  for (const e of report.extraction) {
    console.log(
      `${e.scenario.padEnd(4)} recall=${e.claimRecall} precision=${e.claimPrecision} referent=${e.referentAccuracy} modality=${e.modalityAccuracy} polarity=${e.polarityAccuracy} spanValidity=${e.spanValidity}` +
        (e.spanViolations.length ? ` SPAN_VIOLATIONS=${e.spanViolations.join(",")}` : ""),
    );
  }
  console.log("");
  console.log("Headline:");
  console.log(
    `  False positive rate: ${report.headline.falsePositiveRate.flagged}/${report.headline.falsePositiveRate.mustNotFlagTotal} = ${report.headline.falsePositiveRate.rate}` +
      (report.headline.falsePositiveRate.flaggedScenarios.length ? ` (${report.headline.falsePositiveRate.flaggedScenarios.join(", ")})` : ""),
  );
  console.log(`  Contradiction recall: ${report.headline.contradictionRecall.found}/${report.headline.contradictionRecall.total}`);
  console.log(`  Span validity: ${report.headline.spanValidity.valid}/${report.headline.spanValidity.total} = ${report.headline.spanValidity.rate}`);
  console.log("");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const corpus = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/messages.json"), "utf8")).messages as Message[];
  const cast = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/cast.json"), "utf8")).cast as CastEntry[];
  const goldClaims = JSON.parse(readFileSync(join(ROOT, "evals/gold-claims.json"), "utf8")).claims as GoldClaim[];
  const recordings = loadRecordings();
  const config = getConfig(args.configId);

  if (args.mode === "live") {
    console.error("Live mode is not implemented in the CLI script (it is a hosted-app-only feature behind LIVE_MODE_ENABLED). Use replay.");
    process.exit(1);
  }

  const report = await runEval({ corpus, cast, gold: { claims: goldClaims }, recordings, config, judgeScope: args.judgeScope });
  printScenarioTable(report);

  if (args.printHash) {
    console.log(report.reportHash);
  }

  const baselinePath = join(ROOT, "evals", "baseline.json");
  const baselineRaw = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;
  const hasRealBaseline = baselineRaw && "schemaVersion" in baselineRaw;
  if (hasRealBaseline && !args.diffScope) {
    const diff = diffReports(baselineRaw, report);
    console.log(`Baseline diff: ${diff.summary}`);
    if (diff.anyRegression) {
      console.log("Regressions:");
      for (const row of diff.rows.filter((r) => r.direction === "regressed")) {
        console.log(`  ${row.scenario} ${row.metric}: ${row.baseline} -> ${row.current}`);
      }
      process.exitCode = 1;
    }
  } else if (!hasRealBaseline) {
    console.log("(no baseline.json yet — run `npm run freeze:baseline` once satisfied with these numbers)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
