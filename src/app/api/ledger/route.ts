/**
 * GET /api/ledger — returns the current LedgerSnapshot (or null if none has
 * been built yet). POST /api/ledger — rebuilds the ledger from the corpus at
 * a given as-of (default EVAL_AS_OF) using replay mode, and persists it via
 * the active LedgerStore (file locally, memory on Vercel — see
 * src/server/ledger-factory.ts). Suppression dismiss/restore are separate
 * routes (see api/ledger/suppress).
 */

import { NextResponse } from "next/server";
import { getLedgerStore } from "@/server/ledger-factory";
import { buildDeps } from "@/server/deps";
import { runAdjudicationPipeline, runExtractionPipeline } from "@/core/pipeline";
import { parseInstant, EVAL_AS_OF_DEFAULT } from "@/core/time";
import { CONTESTED_REFERENTS } from "@/core/eval/scenarios";
import { advanceWatermark, emptyWatermark } from "@/core/ledger";
import { ReplayMissError, PromptDriftError } from "@/core/model/client";
import type { LedgerSnapshot, Message } from "@/core/types";
import { sha256Hex } from "@/core/util/sha256";
import { stableStringify } from "@/core/util/stable-sort";

/**
 * The messages referenced by a snapshot's claims, keyed by message id. This
 * is what lets the UI show the real Slack/Gmail text a claim came from
 * without a second round trip — the SourcePanel still calls /api/workspace
 * for the FULL thread (surrounding context), but list/detail views that
 * only need "the one message this claim is about" can use this map
 * directly. Built from the same FsMessageSource /api/ledger already loads
 * deps from, so this is not a second read path.
 */
async function claimMessagesById(snapshot: LedgerSnapshot | null): Promise<Record<string, Message>> {
  if (!snapshot) return {};
  const deps = buildDeps({ mode: "replay", asOf: snapshot.asOf, judgeScope: snapshot.judgeScope });
  const neededIds = new Set(snapshot.claims.map((c) => c.message_id));
  if (neededIds.size === 0) return {};
  const all = await deps.source.listMessages();
  const out: Record<string, Message> = {};
  for (const m of all) {
    if (neededIds.has(m.id)) out[m.id] = m;
  }
  return out;
}

/**
 * Replay-miss/prompt-drift are meant to be loud (see pipeline.ts's
 * isHardReplayError), but "loud" for an API route means a clean JSON error
 * response the UI can render in its error banner — not a bare 500 with no
 * body. This turns the hard-error contract into something the
 * Contradictions tab's fetch() can actually surface to a reviewer.
 */
function errorResponse(err: unknown): Response {
  if (err instanceof ReplayMissError) {
    return NextResponse.json(
      { error: `No recording for this input (step="${err.step}"). Run \`npm run record\` or enable live mode.`, code: "replay_miss" },
      { status: 503 },
    );
  }
  if (err instanceof PromptDriftError) {
    return NextResponse.json({ error: err.message, code: "prompt_drift" }, { status: 503 });
  }
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
}

export async function GET() {
  const store = getLedgerStore();
  const snapshot = await store.read();
  const messages = await claimMessagesById(snapshot);
  return NextResponse.json({ snapshot, storeInfo: store.describe(), messages });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const asOfRaw = typeof body.asOf === "string" ? body.asOf : EVAL_AS_OF_DEFAULT;
  const judgeScope = body.judgeScope === "full7" ? "full7" : "binary";

  let asOf;
  try {
    asOf = parseInstant(asOfRaw);
  } catch {
    return NextResponse.json({ error: `Invalid asOf: "${asOfRaw}" must be ISO-8601 with an explicit offset` }, { status: 400 });
  }

  try {
    const deps = buildDeps({ mode: "replay", asOf, judgeScope });
    const { cast } = deps;
    const messages = await deps.source.listMessages();
    const messagesById = new Map(messages.map((m) => [m.id, m]));

    const extraction = await runExtractionPipeline(messages, cast, deps.model);
    const adjudication = await runAdjudicationPipeline(
      extraction.claims,
      messagesById,
      cast,
      CONTESTED_REFERENTS,
      asOf,
      judgeScope,
      deps.model,
    );

    const store = getLedgerStore();
    const previous = await store.read();

    const corpusHash = sha256Hex(stableStringify(messages.map((m) => ({ id: m.id, text: m.text, timestamp: m.timestamp }))));
    const watermark = advanceWatermark(
      previous?.watermark ?? emptyWatermark(asOf),
      messages.map((m) => ({ id: m.id, timestamp: m.timestamp })),
      asOf,
    );

    const snapshot: LedgerSnapshot = {
      asOf,
      configId: deps.config.id,
      judgeScope,
      corpusHash,
      buckets: adjudication.buckets,
      verdicts: adjudication.verdicts,
      claims: extraction.claims,
      rejectedClaims: extraction.rejectedClaims,
      gatedMessageIds: extraction.gatedMessageIds,
      trace: [...extraction.trace, ...adjudication.trace],
      suppressions: previous?.suppressions ?? [],
      resolutions: previous?.resolutions ?? [],
      watermark,
      createdAt: asOf,
    };

    await store.write(snapshot);

    const neededIds = new Set(snapshot.claims.map((c) => c.message_id));
    const responseMessages: Record<string, Message> = {};
    for (const m of messages) {
      if (neededIds.has(m.id)) responseMessages[m.id] = m;
    }

    return NextResponse.json({ snapshot, storeInfo: store.describe(), messages: responseMessages });
  } catch (err) {
    return errorResponse(err);
  }
}
