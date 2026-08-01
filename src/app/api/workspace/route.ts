/**
 * GET /api/workspace — thin HTTP wrapper over src/adapters/workspace.ts, the
 * in-process corpus adapter that mcp-server/src/adapter.ts re-exports as the
 * four MCP tools (slack_search_messages, slack_get_thread, gmail_search,
 * gmail_get_thread). This route calls that SAME module directly — an
 * in-process function call, not an HTTP request to the MCP server, and not
 * a second implementation of "search Slack/Gmail".
 *
 * The response always names which adapter function served it (`tool`) so
 * the SourcePanel can show honest, specific provenance instead of a vague
 * "loaded via MCP" claim.
 *
 * Query params:
 *   ?thread_id=T1                -> getThread(thread_id)         tool: "slack_get_thread" | "gmail_get_thread"
 *   ?source=slack&query=...      -> slackSearchMessages({...})   tool: "slack_search_messages"
 *   ?source=gmail&query=...      -> gmailSearch({...})           tool: "gmail_search"
 */

import { NextResponse } from "next/server";
import { getThread, slackSearchMessages, gmailSearch } from "@/adapters/workspace";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const threadId = params.get("thread_id");
  if (threadId) {
    const result = getThread(threadId);
    if (!result) {
      return NextResponse.json({ error: `No thread found for thread_id "${threadId}"` }, { status: 404 });
    }
    const tool = result.thread.source === "slack" ? "slack_get_thread" : "gmail_get_thread";
    return NextResponse.json({
      tool,
      servedBy: "in-process by the shared workspace adapter (src/adapters/workspace.ts) — same module the MCP server exposes over stdio",
      thread: result.thread,
      messages: result.messages,
    });
  }

  const source = params.get("source") === "gmail" ? "gmail" : "slack";
  const query = params.get("query") ?? undefined;
  const channel = params.get("channel") ?? undefined;
  const subject = params.get("subject") ?? undefined;
  const author = params.get("author") ?? undefined;
  const since = params.get("since") ?? undefined;
  const until = params.get("until") ?? undefined;
  const limitRaw = params.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (source === "gmail") {
    const messages = gmailSearch({ query, subject, from: author, since, until, limit });
    return NextResponse.json({
      tool: "gmail_search",
      servedBy: "in-process by the shared workspace adapter (src/adapters/workspace.ts) — same module the MCP server exposes over stdio",
      messages,
    });
  }

  const messages = slackSearchMessages({ query, channel, author, since, until, limit });
  return NextResponse.json({
    tool: "slack_search_messages",
    servedBy: "in-process by the shared workspace adapter (src/adapters/workspace.ts) — same module the MCP server exposes over stdio",
    messages,
  });
}
