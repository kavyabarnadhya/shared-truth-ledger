/**
 * The four MCP tools over the shared-truth-ledger fixture corpus:
 * slack.search_messages, slack.get_thread, gmail.search, gmail.get_thread.
 * Thin wrappers around the shared adapter (adapter.ts) — no business logic
 * lives here, just parameter shaping and JSON-text formatting for MCP's
 * content block format.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { slackSearchMessages, gmailSearch, getThread } from "./adapter.ts";

const SearchArgsShape = {
  query: z.string().optional().describe("Substring to search for in message text, case-insensitive"),
  since: z.string().optional().describe("ISO-8601 instant with explicit offset; only messages at or after this"),
  until: z.string().optional().describe("ISO-8601 instant with explicit offset; only messages at or before this"),
  limit: z.number().int().positive().max(200).optional().describe("Max results, default 50"),
};

function textResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "slack_search_messages",
    {
      title: "Search Slack messages",
      description: "Search the workspace's Slack messages by text, channel, author, and/or time range.",
      inputSchema: {
        ...SearchArgsShape,
        channel: z.string().optional().describe('Slack channel, e.g. "#liveops-ludojunction"'),
        author: z.string().optional().describe('Cast handle, e.g. "meera.iyer"'),
      },
    },
    async (args) => textResult(slackSearchMessages(args)),
  );

  server.registerTool(
    "slack_get_thread",
    {
      title: "Get a Slack thread",
      description: "Fetch a full Slack thread (and its messages) by thread id.",
      inputSchema: {
        thread_id: z.string().describe('Thread id, e.g. "T1"'),
      },
    },
    async ({ thread_id }) => {
      const result = getThread(thread_id);
      if (!result) return textResult({ error: `no thread with id "${thread_id}"` });
      return textResult(result);
    },
  );

  server.registerTool(
    "gmail_search",
    {
      title: "Search Gmail messages",
      description: "Search the workspace's Gmail messages by text, subject, sender, and/or time range.",
      inputSchema: {
        ...SearchArgsShape,
        subject: z.string().optional().describe("Exact email subject line"),
        from: z.string().optional().describe('Sender handle/address, e.g. "priya.raghunathan"'),
      },
    },
    async (args) => textResult(gmailSearch(args)),
  );

  server.registerTool(
    "gmail_get_thread",
    {
      title: "Get a Gmail thread",
      description: "Fetch a full Gmail thread (and its messages) by thread id.",
      inputSchema: {
        thread_id: z.string().describe('Thread id, e.g. "T2"'),
      },
    },
    async ({ thread_id }) => {
      const result = getThread(thread_id);
      if (!result) return textResult({ error: `no thread with id "${thread_id}"` });
      return textResult(result);
    },
  );
}
