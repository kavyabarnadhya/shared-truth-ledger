#!/usr/bin/env node
/**
 * Stdio MCP server entry point. Run with `npm run dev` (this workspace) or
 * `npm run mcp` (repo root, after `npm run build` here). Attach with
 * `npx @modelcontextprotocol/inspector node mcp-server/dist/index.js` or
 * point Claude Desktop's MCP config at the built dist/index.js.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.ts";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "shared-truth-ledger",
    version: "0.1.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
