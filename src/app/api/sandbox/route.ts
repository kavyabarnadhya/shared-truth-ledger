/**
 * POST /api/sandbox — the interactive "try your own input" path. A reviewer
 * types or edits up to two messages and this runs extraction + adjudication
 * live (if LIVE_MODE_ENABLED) or replay (if the exact input happens to
 * match a recording, which novel sandbox text generally won't — that's
 * expected and surfaced as a clear "no recording for this input" message,
 * not a fabricated result).
 *
 * Capped input (1,200 chars x 2 messages), server-side rate limit (10 calls
 * per session per 10 min), 429 fallback to replay. The gateway key is read
 * here, server-side only, and never appears in the response body or any
 * client-visible field.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { runExtractionPipeline, runAdjudicationPipeline } from "@/core/pipeline";
import { parseInstant, EVAL_AS_OF_DEFAULT } from "@/core/time";
import { CONTESTED_REFERENTS } from "@/core/eval/scenarios";
import { ReplayModelClient, InMemoryRecordingStore, ReplayMissError, PromptDriftError } from "@/core/model/client";
import { getConfig } from "@/core/model/config";
import { EXTRACTION_PROMPT } from "@/core/prompts/extraction";
import { PROMPT_VERSION as ADJUDICATION_PROMPT_VERSION } from "@/core/prompts/adjudication";
import { loadCastForResolution } from "@/server/deps";
import { LiveModelClient, getGatewayApiKey } from "@/server/live-client";
import { FallbackModelClient } from "@/server/fallback-client";
import { checkRateLimit, generateSessionId } from "@/server/rate-limit";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Message, CastEntry } from "@/core/types";

const MAX_MESSAGE_CHARS = 1200;
const MAX_MESSAGES = 2;

const SandboxMessageSchema = z.object({
  author: z.string().min(1),
  author_role: z.string().default(""),
  text: z.string().min(1).max(MAX_MESSAGE_CHARS),
  timestamp: z.string().refine((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?[+-]\d{2}:\d{2}$/.test(s), {
    message: "timestamp must be ISO-8601 with an explicit offset (e.g. +05:30)",
  }),
  channel: z.string().optional(),
  thread_id: z.string().default("SANDBOX"),
});

const SandboxRequestSchema = z.object({
  messages: z.array(SandboxMessageSchema).min(1).max(MAX_MESSAGES),
  live: z.boolean().default(false),
});

const SESSION_COOKIE = "stl_session";

function loadRecordingsFromDisk(): InMemoryRecordingStore {
  const store = new InMemoryRecordingStore();
  const root = process.cwd();
  for (const tier of ["extraction", "adjudication", "embedding"]) {
    const dir = join(root, "fixtures", "recorded", tier);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      store.put(JSON.parse(readFileSync(join(dir, file), "utf8")));
    }
  }
  return store;
}

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = SandboxRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }

  const liveModeEnabled = process.env.LIVE_MODE_ENABLED === "true";
  const wantsLive = parsed.data.live && liveModeEnabled;

  let sessionId = request.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
  const isNewSession = !sessionId;
  if (!sessionId) sessionId = generateSessionId();

  if (wantsLive) {
    const rl = checkRateLimit(sessionId);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit reached for this session (10 live calls per 10 minutes). Try replay mode, or wait." },
        { status: 429 },
      );
    }
  }

  const cast: CastEntry[] = loadCastForResolution();
  const castHandles = new Set(cast.map((c) => c.handle));

  const messages: Message[] = parsed.data.messages.map((m, i) => {
    const author = castHandles.has(m.author) ? m.author : cast[0]!.handle;
    const authorEntry = cast.find((c) => c.handle === author);
    return {
      id: `SANDBOX-${i}`,
      source: "slack",
      channel: m.channel ?? "#sandbox",
      thread_id: m.thread_id,
      author,
      author_name: authorEntry?.name ?? author,
      author_role: m.author_role || authorEntry?.role || "",
      timestamp: parseInstant(m.timestamp),
      text: m.text,
      participants: [author],
      is_load_bearing: false,
    };
  });

  const config = getConfig("free");
  const recordings = loadRecordingsFromDisk();
  const replayClient = new ReplayModelClient(config, recordings, EXTRACTION_PROMPT.PROMPT_VERSION);

  const extractionModel = wantsLive
    ? new FallbackModelClient(new LiveModelClient(config, getApiKeyOrEmpty()), replayClient)
    : replayClient;

  try {
    const extraction = await runExtractionPipeline(messages, cast, extractionModel);
    const messagesById = new Map(messages.map((m) => [m.id, m]));

    const adjReplayClient = new ReplayModelClient(config, recordings, ADJUDICATION_PROMPT_VERSION);
    const adjModel = wantsLive
      ? new FallbackModelClient(new LiveModelClient(config, getApiKeyOrEmpty()), adjReplayClient)
      : adjReplayClient;

    const adjudication = await runAdjudicationPipeline(
      extraction.claims,
      messagesById,
      cast,
      CONTESTED_REFERENTS,
      EVAL_AS_OF_DEFAULT,
      "binary",
      adjModel,
    );

    const res = NextResponse.json({
      messages,
      claims: extraction.claims,
      rejectedClaims: extraction.rejectedClaims,
      gatedMessageIds: extraction.gatedMessageIds,
      buckets: adjudication.buckets,
      verdicts: adjudication.verdicts,
      trace: [...extraction.trace, ...adjudication.trace],
      liveModeUsed: wantsLive,
    });
    if (isNewSession) {
      res.cookies.set(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 });
    }
    return res;
  } catch (err) {
    if (err instanceof ReplayMissError) {
      return NextResponse.json(
        {
          error: "No recording for this input. Enable live mode to run it.",
          code: "replay_miss",
        },
        { status: 503 },
      );
    }
    if (err instanceof PromptDriftError) {
      return NextResponse.json({ error: err.message, code: "prompt_drift" }, { status: 503 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

function getApiKeyOrEmpty(): string {
  try {
    return getGatewayApiKey();
  } catch {
    return "";
  }
}
