/**
 * Re-exports the exact same in-process adapter the web app imports
 * (../../src/adapters/workspace.ts) — so the MCP server and the web app
 * search the identical corpus through identical logic. There is exactly
 * one implementation of "search Slack/Gmail" in this repo, not two that
 * could silently drift apart.
 */

export {
  slackSearchMessages,
  gmailSearch,
  getThread,
  type SlackSearchParams,
  type GmailSearchParams,
} from "../../src/adapters/workspace.ts";
