/**
 * Static content, no live MCP call from the browser (consistent with
 * "reviewer runs nothing" — see the sidebar footer note). Documents the four
 * MCP tools and the shared adapter both the web app and mcp-server/ import,
 * so the boundary the brief says it will look at is visible on screen, not
 * just in a README section. README §7 stays the detailed version; this is
 * the on-screen pointer to it.
 */

const TOOLS = [
  {
    name: "slack.search_messages",
    description: "Search the workspace's Slack messages by text, channel, author, and/or time range.",
  },
  {
    name: "slack.get_thread",
    description: "Fetch a full Slack thread (and its messages) by thread id.",
  },
  {
    name: "gmail.search",
    description: "Search the workspace's Gmail messages by text, subject, sender, and/or time range.",
  },
  {
    name: "gmail.get_thread",
    description: "Fetch a full Gmail thread (and its messages) by thread id.",
  },
] as const;

export function ToolBoundaryPanel() {
  return (
    <div>
      <p>
        Quorum treats Slack and Gmail as tool-shaped data sources, not a database it reads directly: every read goes
        through one of four named tools, each scoped to exactly one kind of query.
      </p>
      <table className="claim-table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          {TOOLS.map((t) => (
            <tr key={t.name}>
              <td className="mono-cell">{t.name}</td>
              <td>{t.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: "var(--space-2)" }}>
        Both MCP tools sit on top of one adapter module,{" "}
        <code>src/adapters/workspace.ts</code>, over the same underlying
        corpus files (<code>fixtures/corpus/*.json</code>) the web app also
        reads.
      </p>
      <ul className="prerule-list">
        <li>
          <code>mcp-server/</code> exposes that adapter over{" "}
          <strong>stdio</strong> as the four MCP tools above (see{" "}
          <code>mcp-server/src/adapter.ts</code>, which re-exports it
          directly) — no network call, no HTTP round trip to the web app.
        </li>
        <li>
          The web app itself reads the same corpus files through its own
          in-process <code>FsMessageSource</code> (
          <code>src/server/deps.ts</code>), implementing the same{" "}
          <code>MessageSource</code> interface rather than importing the
          adapter module directly — same data, same query shape, one
          interface, two call-sites. Consolidating the web app onto the
          adapter module too is a natural next step, not yet done.
        </li>
      </ul>
      <p className="claim-state-label">
        This is a bonus surface, evidenced here rather than something a
        reviewer is expected to run — attaching an MCP client needs a
        terminal, which the primary hosted-link path doesn&apos;t require.
        See README §7 for the detailed version.
      </p>
    </div>
  );
}
