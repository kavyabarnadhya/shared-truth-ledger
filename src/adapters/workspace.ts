/**
 * The in-process corpus adapter. The web app imports this module directly
 * (never over HTTP, never via its own MCP server) — see
 * src/server/deps.ts's FsMessageSource, which is the Next-specific
 * wrapper around the same underlying JSON files this module also reads.
 *
 * mcp-server/src/adapter.ts re-exports this exact module, so the MCP
 * server and the web app search the identical corpus through identical
 * logic — there is exactly one implementation of "search Slack/Gmail",
 * not two that could drift.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Message, Thread, MessageQuery, SourceKind } from "../core/types.ts";
import { tryParseInstant } from "../core/time.ts";

const ROOT = join(import.meta.dirname, "..", "..");

let cachedMessages: Message[] | null = null;
let cachedThreads: Thread[] | null = null;

function loadMessages(): Message[] {
  if (!cachedMessages) {
    cachedMessages = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/messages.json"), "utf8")).messages;
  }
  return cachedMessages!;
}

function loadThreads(): Thread[] {
  if (!cachedThreads) {
    cachedThreads = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/threads.json"), "utf8")).threads;
  }
  return cachedThreads!;
}

export interface SlackSearchParams {
  query?: string;
  channel?: string;
  author?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface GmailSearchParams {
  query?: string;
  subject?: string;
  from?: string;
  since?: string;
  until?: string;
  limit?: number;
}

/**
 * `since`/`until` arrive as plain strings from an external MCP tool call —
 * untrusted input, unlike the branded `Instant` the rest of the pipeline
 * carries internally. Parsed here (and silently ignored if malformed,
 * rather than throwing and failing the whole search) so a client passing a
 * bad timestamp gets unfiltered-by-time results instead of an opaque error.
 */
function search(
  source: SourceKind,
  params: {
    query?: string; channel?: string; subject?: string; author?: string;
    since?: string; until?: string; limit?: number;
  },
): Message[] {
  const query: MessageQuery = {
    source,
    query: params.query,
    channel: params.channel,
    subject: params.subject,
    author: params.author,
    since: params.since ? (tryParseInstant(params.since) ?? undefined) : undefined,
    until: params.until ? (tryParseInstant(params.until) ?? undefined) : undefined,
    limit: params.limit,
  };

  let results = loadMessages().filter((m) => m.source === query.source);
  if (query.channel) results = results.filter((m) => m.channel === query.channel);
  if (query.subject) results = results.filter((m) => m.subject === query.subject);
  if (query.author) results = results.filter((m) => m.author === query.author);
  if (query.since) results = results.filter((m) => m.timestamp >= query.since!);
  if (query.until) results = results.filter((m) => m.timestamp <= query.until!);
  if (query.query) {
    const needle = query.query.toLowerCase();
    results = results.filter((m) => m.text.toLowerCase().includes(needle));
  }
  results = [...results].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  return results.slice(0, query.limit ?? 50);
}

export function slackSearchMessages(params: SlackSearchParams): Message[] {
  return search("slack", params);
}

export function gmailSearch(params: GmailSearchParams): Message[] {
  return search("gmail", { ...params, author: params.from });
}

export function getThread(thread_id: string): { thread: Thread; messages: Message[] } | null {
  const thread = loadThreads().find((t) => t.thread_id === thread_id);
  if (!thread) return null;
  const allMessages = loadMessages();
  const messages = thread.message_ids
    .map((id) => allMessages.find((m) => m.id === id))
    .filter((m): m is Message => m !== undefined);
  return { thread, messages };
}
