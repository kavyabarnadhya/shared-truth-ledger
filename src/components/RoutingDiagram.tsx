/**
 * Part C: the two-model-route diagram, translating the user's hand-drawn
 * Excalidraw flow into the product's actual technical routing — verified
 * against src/core/pipeline.ts's runAdjudicationPipeline before drawing a
 * single box, not guessed at.
 *
 * Rendering choice: this repo has zero markdown/diagram-rendering
 * dependencies (see package.json) and the prior passes' established
 * discipline is not to add an npm dependency without first checking a
 * lighter path. A live client-side Mermaid renderer was evaluated first —
 * mermaid's current distribution is a chunked ESM bundle (mermaid.esm.mjs
 * dynamically importing ~15 sub-chunks), which cannot be integrity-checked
 * with a single SRI hash on one <script> tag the way a monolithic UMD
 * bundle can, and pulling the whole chunk graph in via CDN with only a
 * top-level hash would be a weaker guarantee than it looks. A pre-rendered
 * static SVG — generated once at authoring time via `npx @mermaid-js/
 * mermaid-cli` (an ephemeral dev-time tool, never added to package.json or
 * package-lock.json) and committed to /public/diagrams — renders
 * identically everywhere, needs no client-side JS, works offline, and has
 * no supply-chain surface at request time. The Mermaid source is committed
 * alongside it (routing-diagram.mmd) so the diagram is auditable and
 * regenerable, not an opaque binary.
 */
export function RoutingDiagram() {
  return (
    <div className="drilldown" style={{ padding: "var(--space-2)" }}>
      <img
        src="/diagrams/routing-diagram.svg"
        alt="Flowchart: a message arrives from Slack or Gmail and passes through a deterministic noise gate (bots and CI are dropped before extraction). Surviving messages go through a model extraction call, then deterministic referent resolution, then the deterministic pre-rules ladder (R0-R9). If a pre-rule settles the question, the verdict (UPDATE, RESOLVED_BY_SUPERSESSION, RESOLVED_BY_CORRECTION, AMBIGUOUS_REFERENT, or COMPATIBLE) is decided by code with no model call. If undecided (two or more live claims from different people, no rule fires), the judge scope branches: Guardrailed (binary) sends exactly one CONTRADICTION-or-COMPATIBLE question to the model in one call. Open (full7) instead lets the model choose freely from the full seven-way verdict vocabulary in one call. Every path converges on the ledger, which persists claims, verdicts, suppressions, and the watermark."
        style={{ width: "100%", height: "auto", display: "block" }}
      />
      <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>
        Rendered once from{" "}
        <a href="/diagrams/routing-diagram.mmd" target="_blank" rel="noreferrer">
          routing-diagram.mmd
        </a>{" "}
        (Mermaid syntax, committed alongside the SVG) via <code>npx @mermaid-js/mermaid-cli</code> — a dev-time tool
        only, not a runtime or npm dependency of this app. Verified against <code>src/core/pipeline.ts</code>&apos;s{" "}
        <code>runAdjudicationPipeline</code>, not hand-drawn from memory.
      </p>
    </div>
  );
}
