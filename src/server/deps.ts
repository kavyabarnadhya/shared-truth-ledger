/**
 * Builds the PipelineDeps bundle server-side API routes need: a
 * MessageSource over the fs-backed corpus, the appropriate ModelClient for
 * the requested mode, the frozen clock, and the active config/judgeScope.
 * The one place that decides "replay vs live" for a request.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type {
  CastEntry,
  Message,
  MessageSource,
  MessageQuery,
  Thread,
  PipelineDeps,
  JudgeScope,
  ModelClient,
  ModelConfig,
  ModelRequest,
} from "../core/types.ts";
import { fixedClock, parseInstant, EVAL_AS_OF_DEFAULT, type Instant } from "../core/time.ts";
import { ReplayModelClient, InMemoryRecordingStore } from "../core/model/client.ts";
import { getConfig } from "../core/model/config.ts";
import { EXTRACTION_PROMPT } from "../core/prompts/extraction.ts";
import { PROMPT_VERSION as ADJUDICATION_PROMPT_VERSION } from "../core/prompts/adjudication.ts";
import { LiveModelClient, getGatewayApiKey } from "./live-client.ts";
import { FallbackModelClient } from "./fallback-client.ts";

// process.cwd() rather than import.meta.dirname: this file is server-only
// (never bundled for the browser), but Next's webpack build for API routes
// does not preserve import.meta.dirname reliably across route handlers —
// process.cwd() is the documented, portable way to locate the project root
// from a Next.js server context, both in `next dev`/`next start` and on
// Vercel (where the deployed function's cwd is the project root).
const ROOT = process.cwd();

export class FsMessageSource implements MessageSource {
  private readonly messages: Message[];
  private readonly threads: Thread[];

  constructor(messages: Message[], threads: Thread[]) {
    this.messages = messages;
    this.threads = threads;
  }

  async listMessages(): Promise<Message[]> {
    return [...this.messages].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : a.id < b.id ? -1 : 1));
  }

  async searchMessages(q: MessageQuery): Promise<Message[]> {
    let results = this.messages;
    if (q.source) results = results.filter((m) => m.source === q.source);
    if (q.channel) results = results.filter((m) => m.channel === q.channel);
    if (q.subject) results = results.filter((m) => m.subject === q.subject);
    if (q.author) results = results.filter((m) => m.author === q.author);
    if (q.since) results = results.filter((m) => m.timestamp >= q.since!);
    if (q.until) results = results.filter((m) => m.timestamp <= q.until!);
    if (q.query) {
      const needle = q.query.toLowerCase();
      results = results.filter((m) => m.text.toLowerCase().includes(needle));
    }
    results = [...results].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
    return results.slice(0, q.limit ?? 50);
  }

  async getThread(thread_id: string): Promise<{ thread: Thread; messages: Message[] } | null> {
    const thread = this.threads.find((t) => t.thread_id === thread_id);
    if (!thread) return null;
    const messages = thread.message_ids
      .map((id) => this.messages.find((m) => m.id === id))
      .filter((m): m is Message => m !== undefined);
    return { thread, messages };
  }

  async getMessage(id: string): Promise<Message | null> {
    return this.messages.find((m) => m.id === id) ?? null;
  }

  async listThreads(): Promise<Thread[]> {
    return [...this.threads].sort((a, b) => (a.thread_id < b.thread_id ? -1 : a.thread_id > b.thread_id ? 1 : 0));
  }
}

export function loadCorpusFromDisk(): { messages: Message[]; threads: Thread[]; cast: CastEntry[] } {
  const messages = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/messages.json"), "utf8")).messages as Message[];
  const threads = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/threads.json"), "utf8")).threads as Thread[];
  const cast = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/cast.json"), "utf8")).cast as CastEntry[];
  return { messages, threads, cast };
}

function loadRecordingsFromDisk(): InMemoryRecordingStore {
  const store = new InMemoryRecordingStore();
  for (const tier of ["extraction", "adjudication", "embedding"]) {
    const dir = join(ROOT, "fixtures", "recorded", tier);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const call = JSON.parse(readFileSync(join(dir, file), "utf8"));
      store.put(call);
    }
  }
  return store;
}

export interface BuildDepsOptions {
  mode: "replay" | "live";
  configId?: string;
  judgeScope?: JudgeScope;
  asOf?: Instant;
  /** Which prompt version to key extraction calls on — kept in sync with prompts/extraction.ts. */
  extractionPromptVersion?: number;
}

/**
 * Two ReplayModelClient instances, one per tier — mirrors
 * core/eval/run-eval.ts's extractionClient/adjudicationClient split.
 * ReplayModelClient's cache key is keyed on its constructor-supplied
 * promptVersion, so a single shared client here would silently key every
 * adjudication call on the extraction prompt's version — wrong whenever the
 * two diverge, since extraction.ts and adjudication.ts each own their own
 * PROMPT_VERSION independently. `deps.model` stays a single ModelClient
 * from the caller's point of view: PipelineDeps.model is one field, and
 * both pipelines index into request.tier via this router.
 */
class TieredReplayClient implements ModelClient {
  readonly mode = "replay" as const;
  readonly config: ModelConfig;
  private readonly extraction: ReplayModelClient;
  private readonly adjudication: ReplayModelClient;

  constructor(extraction: ReplayModelClient, adjudication: ReplayModelClient) {
    this.config = extraction.config;
    this.extraction = extraction;
    this.adjudication = adjudication;
  }

  call(req: ModelRequest) {
    const client = req.tier === "adjudication" ? this.adjudication : this.extraction;
    return client.call(req);
  }
}

export function buildDeps(opts: BuildDepsOptions): PipelineDeps & { source: MessageSource; cast: CastEntry[] } {
  const config = getConfig(opts.configId ?? "free");
  const judgeScope = opts.judgeScope ?? "binary";
  const { messages, threads, cast } = loadCorpusFromDisk();
  const source = new FsMessageSource(messages, threads);
  const clock = fixedClock(opts.asOf ?? EVAL_AS_OF_DEFAULT);

  const recordings = loadRecordingsFromDisk();
  const extractionReplay = new ReplayModelClient(config, recordings, opts.extractionPromptVersion ?? EXTRACTION_PROMPT.PROMPT_VERSION);
  const adjudicationReplay = new ReplayModelClient(config, recordings, ADJUDICATION_PROMPT_VERSION);
  const replayClient = new TieredReplayClient(extractionReplay, adjudicationReplay);

  if (opts.mode === "replay") {
    return { source, model: replayClient, clock, config, judgeScope, cast };
  }

  const apiKey = getGatewayApiKey();
  const liveClient = new LiveModelClient(config, apiKey);
  const fallbackClient = new FallbackModelClient(liveClient, replayClient);
  return { source, model: fallbackClient, clock, config, judgeScope, cast };
}

export function loadCastForResolution(): CastEntry[] {
  return loadCorpusFromDisk().cast;
}

export { parseInstant, ADJUDICATION_PROMPT_VERSION };
