"use client";

import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

/**
 * Live talking-point page: how this assignment was actually built, organised
 * around the assignment's own 5 evaluation dimensions rather than a generic
 * "process" narrative. Every claim here is sourced from git history, README,
 * or the author's own first-person account of the earlier planning chat —
 * nothing invented for this page. Styled with the app's existing tokens
 * (page-title, section-heading, prerule-list, claim-table, headline-row) —
 * no new visual language.
 */
export default function ProcessPage() {
  return (
    <main className="page deck-page">
      <div className="deck-page__topbar">
        <Wordmark />
        <Link href="/" className="claim-state-label">
          ← Back to Quorum
        </Link>
      </div>

      <h1 className="page-title">How this was built</h1>
      <p className="page-subtitle">
        Five dimensions this assignment is actually evaluated on, each answered with a real decision made building
        Quorum — not vocabulary. Built with <strong>Claude Code</strong> (Claude Sonnet 5 as the coding assistant)
        across iterative sessions; every commit in this repo carries a <code>Co-Authored-By</code> trailer.
      </p>

      <DimensionProblem />
      <DimensionScoping />
      <DimensionMethodology />
      <DimensionEvals />
      <DimensionSystemDesign />
    </main>
  );
}

function Dimension({
  n,
  title,
  ask,
  children,
}: {
  n: number;
  title: string;
  ask: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: "var(--space-5)" }}>
      <h2 className="section-heading" style={{ fontSize: "var(--size-h2, 1.3rem)" }}>
        {n}. {title}
      </h2>
      <p className="claim-state-label" style={{ marginBottom: "var(--space-2)" }}>
        What&apos;s being evaluated: {ask}
      </p>
      {children}
    </section>
  );
}

function DimensionProblem() {
  return (
    <Dimension
      n={1}
      title="Problem structuring"
      ask="can an open brief become a problem statement sharp enough to engineer against — specific user, specific trigger, specific outcome, explicit assumptions, observable success criteria?"
    >
      <p>
        <strong>User:</strong> a PM at a mobile games studio running live ops. <strong>Trigger:</strong> a message
        asserts something about a referent — a launch date, a success metric, a scope decision — where a live claim
        from a different person already conflicts with it. <strong>Outcome:</strong> the conflict surfaces with both
        source messages and the reasoning, before it reaches execution.
      </p>
      <p>
        Before any of that was fixed, the recruiter had accidentally attached a completed reference deck alongside
        the real brief — a different, already-solved approach to the same prompt. On seeing both were the same
        brief, the call was to build a genuinely different problem angle rather than risk reading as derivative,
        despite time already spent thinking through that other shape. Research came before code: producer
        pain-point threads, a former EA PM&apos;s recorded talk on misaligned definitions of success and a
        &ldquo;data truth trap,&rdquo; and the Tufts mental-model-discrepancy literature — used as a frame, not
        cited as if lab-study numbers on a two-person task transferred to this domain.
      </p>
      <p>
        Claude&apos;s first framing was a plain misalignment detector — pushed back on hard: was contradiction
        detection even the right unit, or was there a bigger idea underneath it? That&apos;s where &ldquo;shared-truth
        ledger&rdquo; came from — contradiction detection as the first thing built on top of a persistent belief
        model, not the whole idea.
      </p>
      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        Explicit assumption
      </h3>
      <p>
        No games-studio PM was interviewed to validate this. What would be validated first, given the chance:
        whether contradiction (what this system detects) or omission (what it deliberately does not) is the failure
        mode PMs actually notice first in practice.
      </p>
      <table className="claim-table" style={{ marginTop: "var(--space-2)" }}>
        <thead>
          <tr>
            <th>Success metric</th>
            <th>Measurable from this corpus?</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Detection lead time</td><td>Yes</td></tr>
          <tr><td>Caught before vs. after execution</td><td>Yes</td></tr>
          <tr><td>Time to reconcile</td><td>Partially</td></tr>
          <tr><td>Rework avoided</td><td>No — needs studio-supplied revenue/cost inputs</td></tr>
        </tbody>
      </table>
    </Dimension>
  );
}

const STAGES: Array<{ label: string; state: "done" | "deferred"; description: string }> = [
  { label: "Stage 1 — Ledger", state: "done", description: "Claim history per referent. Useful with zero contradictions detected." },
  { label: "Stage 2 — Adjudication", state: "done", description: "Earned by Stage 1 — runs only on buckets already holding 2+ live claims." },
  { label: "Stage 3 — Deferred", state: "deferred", description: "Minutes, owner/ETA tracking, gated reconciliation drafting, omission detection." },
];

function StageChip({ label, state, description }: { label: string; state: "done" | "deferred"; description: string }) {
  const done = state === "done";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3em", flex: "1 1 12rem" }}>
      <span
        style={{
          display: "inline-block",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--size-caption)",
          padding: "0.25em 0.8em",
          borderRadius: "999px",
          width: "fit-content",
          color: done ? "var(--settled)" : "var(--muted)",
          background: done ? "var(--settled-bg)" : "transparent",
          border: done ? "1px solid transparent" : "1px dashed var(--rule)",
        }}
      >
        {label}
      </span>
      <span className="claim-state-label">{description}</span>
    </div>
  );
}

function DimensionScoping() {
  return (
    <Dimension
      n={2}
      title="Scoping in stages"
      ask="can a fuzzy goal decompose into shippable stages where each stage earns the right to the next — and what got cut, and why?"
    >
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
        {STAGES.map((s) => (
          <StageChip key={s.label} {...s} />
        ))}
      </div>
      <p>
        There was a bigger, flashier idea early on — an AI that sits in meetings, sends minutes, tracks owners, a
        full personal-assistant pitch. It was dropped deliberately, not because it was uninteresting, but because
        the same research that grounded the problem statement showed &ldquo;too many meetings&rdquo; was the #1
        complaint from actual game devs — shipping something that generates more meeting artifacts would have been
        tone-deaf to that same sourcing. The ambition moved to the roadmap instead of the MVP; the ledger stayed the
        thing that made the roadmap trustworthy later, rather than being cut along with it.
      </p>
      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        What else got cut, and why
      </h3>
      <table className="claim-table">
        <thead>
          <tr>
            <th>Cut</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Fine-tuning</td><td>Two-tier prompting is enough at this volume and eval surface</td></tr>
          <tr><td>Chunk-and-embed RAG</td><td>Wrong unit of meaning — the unit is a claim, not a 512-token window</td></tr>
          <tr><td>Vector memory store</td><td>Same reasoning — claims are structured records, not embeddings to search</td></tr>
          <tr><td>Multi-agent debate / planning</td><td>Would make regression testing impossible; eval is what this project optimises for</td></tr>
          <tr><td>Real OAuth, real-time streaming</td><td>Out of scope for this build&apos;s surface</td></tr>
        </tbody>
      </table>
      <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>
        <code>/settings</code> demonstrates the Stage 3 configuration surface as a real form with real local state —
        every control traceable to an actual field in the codebase — but stays inert by design: wiring it live
        would break the reproducibility guarantee the Evals tab depends on.
      </p>
    </Dimension>
  );
}

function DimensionMethodology() {
  return (
    <Dimension
      n={3}
      title="Applied AI methodology"
      ask="depth of fluency with agents and orchestration, tool calls, context loading, hand-offs, model selection, hooks, and MCP — considered choices, not vocabulary."
    >
      <div className="drilldown" style={{ padding: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <img
          src="/diagrams/build-process-loop.svg"
          alt="Loop diagram: hands-on product testing surfaces a result that looks wrong or unclear, which gets traced to root cause in source rather than guessed at, then fixed, then verified against the committed eval baseline via npm run eval. If the eval shows a regression, it loops back to root-cause tracing. If it shows zero regressions, the change ships and the loop returns to more hands-on testing."
          style={{ width: "100%", maxWidth: "22rem", height: "auto", display: "block", margin: "0 auto" }}
        />
        <p className="claim-state-label" style={{ marginTop: "var(--space-2)", textAlign: "center" }}>
          The build&apos;s own loop, as actually practiced — distinct from the running system&apos;s data-flow
          pipeline on <Link href="/architecture">Architecture</Link>.
        </p>
      </div>

      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        The escalation-router incident
      </h3>
      <p>
        The most surprising thing that happened wasn&apos;t in planning — it was after deployment. An added feature
        (a confidence-gated escalation router) silently regressed one eval scenario while improving another: net
        zero on correctness, zero buckets ever actually escalated across the full recorded set, and it sat live on
        the deployed site until it was caught by closely reading the eval diff output, not by trusting a headline
        number. A full investigation was demanded before any fix — specifically to know whether this was a
        baseline-freezing artifact or a real logic bug before deciding what to do.
      </p>
      <p>
        Given the investigation, the call was to revert the router entirely rather than keep the one scenario it
        had &ldquo;improved&rdquo; — carrying a known, unresolved regression into a submission wasn&apos;t
        acceptable just because the net was zero. A separate, genuinely diagnosable bug found in the same pass (a
        referent-resolution issue behind one missed contradiction) was fixed. A second failing case was left
        reported as an honest, documented limitation rather than forced to a fix — one real, understood gap beats
        something that looks artificially perfect. See commit <code>b69ca2d</code>.
      </p>

      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        Concrete choices, not buzzwords
      </h3>
      <ul className="prerule-list">
        <li>
          <strong>Model selection, sequenced and reversible.</strong> Free tier first, deliberately — prove the
          whole orchestration before spending on a paid model. This shaped the architecture, not just the budget:
          every model call goes through one <code>ModelClient</code> interface, and every implementation (live,
          replay, stub, fallback) satisfies it identically — confirmed by grepping for any <code>instanceof</code>{" "}
          check on a concrete client anywhere in the pipeline and finding none. A <code>strong</code> config
          (Claude Sonnet 5 for adjudication) is already fully plumbed and selectable via <code>--config=strong</code>{" "}
          — swapping the free model for a stronger one later is a config change, not a rewrite, and that interface
          boundary is the receipt, not just the claim.
        </li>
        <li>
          <strong>Context loading is bounded, on purpose.</strong> Extraction sends the prior 3 messages in the same
          thread as context, not the whole thread — enough for a single-claim extraction task, without paying for
          or diluting the call with unbounded history.
        </li>
        <li>
          <strong>No hand-offs between sub-agents.</strong> There is no planner and no sub-agent delegation. The
          pipeline order — gate, extract, resolve, pre-rule, adjudicate, persist — never varies, and nothing decides
          what runs next at runtime. A planner agent choosing the pipeline dynamically would make regression testing
          impossible, and eval quality is explicitly what this project optimises for over agentic flexibility.
        </li>
        <li>
          <strong>No git hooks.</strong> Not used in this build. The closer equivalent is a manual discipline: every
          change to the scored pipeline is gated by reading <code>npm run eval</code>&apos;s baseline diff before
          it&apos;s considered done — the same check a pre-commit hook would automate, done by habit instead of
          tooling here.
        </li>
        <li>
          <strong>MCP as the real external-tool boundary.</strong> <code>mcp-server/</code> exposes the fixture
          corpus over stdio as four tools (Slack search/thread, Gmail search/thread), both backed by one shared
          adapter module. Said plainly, not overstated: the web app doesn&apos;t yet import that same adapter — it
          reads the identical corpus through a separate in-process implementation of the same interface. One
          interface, two call-sites, not yet consolidated — a known next step, not hidden.
        </li>
      </ul>

      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        Scope discipline near the end
      </h3>
      <p>
        Live-configurable temperature/thresholds and a Zapier/Make-style drag-and-drop orchestration builder were
        both considered. The node-builder was dropped once it was clear a flashy graph UI would visually
        misrepresent a system that&apos;s mostly deterministic code with only two narrow model calls in it —
        <code>/settings</code> stayed, but scoped explicitly as a non-functional demonstration surface, protecting
        the reproducibility guarantee the Evals tab depends on rather than trading it for a more impressive-looking
        page.
      </p>
    </Dimension>
  );
}

function DimensionEvals() {
  return (
    <Dimension
      n={4}
      title="Eval design"
      ask="how do you know the agent is actually correct — and would you catch a regression when a prompt changes?"
    >
      <p>
        Two graders, never merged. The extraction grader scores the pipeline&apos;s real predicted claims. The
        adjudication grader is fed <strong>gold</strong> claims only, never the extractor&apos;s own output — so a
        bad extraction run can neither mask nor manufacture an adjudication error. Per-scenario results, never
        averaged — a weak spot must not hide behind a healthy mean.
      </p>
      <div className="headline-row">
        <div className="headline-item">
          <span className="headline-item__label">False positive rate</span>
          <span className="headline-fraction">0/18 = 0</span>
        </div>
        <div className="headline-item">
          <span className="headline-item__label">Contradiction recall</span>
          <span className="headline-fraction">6/8</span>
        </div>
        <div className="headline-item">
          <span className="headline-item__label">Span validity</span>
          <span className="headline-fraction">65/65 = 1</span>
        </div>
      </div>
      <p className="claim-state-label">
        Reproducible via <code>npm run eval</code>, or live in the browser on the <Link href="/evals">Evals</Link>{" "}
        tab — no API key required either way.
      </p>
      <p>
        One scenario (a staged rollout with a stale client cache — both readings can genuinely be true at once) is
        labeled CONTESTED and excluded from headline scoring entirely, rather than folded into precision or recall
        where it would misrepresent what the system actually got right or wrong.
      </p>
      <p>
        The single best evidence the ledger is stateful, not a pairwise text diff: the flagship launch-date bucket
        evaluated at two points in time — a live contradiction between two people at one snapshot, resolved by
        deterministic authority-based supersession once the studio head&apos;s message lands at the next, never by
        asking the model to be clever about who outranks whom.
      </p>
      <p className="claim-state-label">
        The reproducibility push itself came from a product judgment, not a technical default: the assumption was a
        reviewer wouldn&apos;t run terminal commands, so the eval suite needed to be runnable from the UI, not just
        documented — that decision is why Evals is a first-class in-browser tab today, not a script with a results
        file attached.
      </p>
    </Dimension>
  );
}

function DimensionSystemDesign() {
  return (
    <Dimension
      n={5}
      title="System design accuracy"
      ask="does the system hang together end to end — data flow, state, persistence, cold start vs. steady state, failure modes, what survives a restart, what depends on what?"
    >
      <p>
        <code>npm ci && npm run eval</code> reproduces the same per-scenario numbers on any machine, offline, with
        no API key. Replay is the only mode the eval harness uses — every model call is cached to a committed
        recording, keyed on model + prompt version + semantic input. The replay boundary is narrow: only the raw
        model HTTP response is cached, everything else (noise gate, schema/span validation, referent resolution,
        pre-rules, both graders) runs live in every mode. A replay miss is a hard, visible error, never a silent
        fallback. Nothing in the scored pipeline calls <code>Date.now()</code> — enforced by a repo-wide test —
        so evaluation time is a frozen, injected parameter everywhere.
      </p>
      <p>
        <strong>If you stub a connector, stub it cleanly behind the same interface you&apos;d use for the real
        one — this is checkable, not just claimed.</strong> Every model-call implementation (live, replay, stub,
        fallback) satisfies one <code>ModelClient</code> interface, and the pipeline only ever calls{" "}
        <code>model.call(...)</code> through it — grepping for an <code>instanceof</code> check on any concrete
        client, anywhere a model gets called, turns up zero. Swapping the free model for the already-plumbed strong
        config is a config change, not a rewrite, because that boundary is real.
      </p>
      <p>
        <strong>Persistence:</strong> an env var (<code>LEDGER_STORE</code>) picks between a file-backed store,
        which survives a restart, and an in-memory store that matches a warm serverless instance and resets on
        cold start — both exist because the deployment target determines which guarantee is available, not because
        one is more &ldquo;finished&rdquo; than the other.
      </p>
      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        Failure modes, named rather than hidden
      </h3>
      <ul className="prerule-list">
        <li>
          A JSON parse failure falls back to COMPATIBLE, deliberately — this can only ever hurt contradiction
          recall, never inflate the false-positive rate. A conservative failure mode chosen on purpose, not an
          accident.
        </li>
        <li>
          The flagship launch-date transition reproduces on the gold-claims eval path but not on the live-app
          extractor path — one specific message&apos;s live extraction call truncates before finishing, and is
          correctly rejected rather than guessed at. Root-caused exactly, disclosed on the live page itself, and
          deliberately not patched by re-prompting or raising the token cap after seeing the result — that would be
          exactly the kind of post-hoc tuning this project refuses to do.
        </li>
        <li>
          The noise gate&apos;s short-message rule also gates some legitimate short acknowledgements along with
          genuine chatter — an accepted precision/recall tradeoff in the gate itself, reported via a visible gated-
          message count rather than hidden.
        </li>
      </ul>
    </Dimension>
  );
}
