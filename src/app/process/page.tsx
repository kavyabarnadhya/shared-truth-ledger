"use client";

import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

/**
 * Live talking-point page: how this assignment was actually built, organised
 * around the assignment's own 5 evaluation dimensions rather than a generic
 * "process" narrative. Every claim here is sourced from git history, README,
 * or the author's own first-person account of the earlier planning chat.
 * Nothing invented for this page. Styled with the app's existing tokens
 * (page-title, section-heading, prerule-list, claim-table, headline-row).
 * No new visual language.
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
        Five dimensions this assignment is actually evaluated on, each answered with a real decision I made
        building Quorum, not vocabulary. I built it with <strong>Claude Code</strong> (Claude Sonnet 5 as the
        coding assistant) across iterative sessions; every commit in this repo carries a{" "}
        <code>Co-Authored-By</code> trailer.
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
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: "var(--space-5)" }}>
      <h2 className="section-heading" style={{ fontSize: "var(--size-h2, 1.3rem)" }}>
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function DimensionProblem() {
  return (
    <Dimension
      n={1}
      title="Problem structuring"
    >
      <p>
        <strong>User:</strong> a PM at a mobile games studio running live ops. <strong>Trigger:</strong> a message
        asserts something about a referent (a launch date, a success metric, a scope decision) where a live claim
        from a different person already conflicts with it. <strong>Outcome:</strong> the conflict surfaces with
        both source messages and the reasoning, before it reaches execution.
      </p>
      <p>
        I pushed for real research before writing any code: producer pain-point threads, a former EA PM&apos;s
        recorded talk on misaligned definitions of success and a &ldquo;data truth trap,&rdquo; and the Tufts
        mental-model-discrepancy literature. I used that as a frame, not as evidence. I didn&apos;t cite their
        lab-study numbers on a two-person task as if they transferred to this domain.
      </p>
      <p>
        Claude&apos;s first framing was a plain misalignment detector. I pushed back on it: was contradiction
        detection even the right unit, or was there a bigger idea underneath it? That&apos;s where I landed on
        &ldquo;shared-truth ledger&rdquo; instead: contradiction detection as the first thing built on top of a
        persistent belief model, not the whole idea.
      </p>
      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        Explicit assumption
      </h3>
      <p>
        No games-studio PM was interviewed to validate this. What I&apos;d validate first, given the chance:
        whether contradiction (what this system detects) or omission (what it deliberately does not) is the
        failure mode PMs actually notice first in practice.
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
          <tr><td>Rework avoided</td><td>No. Needs studio-supplied revenue/cost inputs.</td></tr>
        </tbody>
      </table>
    </Dimension>
  );
}

const STAGES: Array<{ label: string; state: "done" | "deferred"; description: string }> = [
  { label: "Stage 1: Ledger", state: "done", description: "Claim history per referent. Useful with zero contradictions detected." },
  { label: "Stage 2: Adjudication", state: "done", description: "Earned by Stage 1. Runs only on buckets already holding 2+ live claims." },
  { label: "Stage 3: Deferred", state: "deferred", description: "Minutes, owner/ETA tracking, gated reconciliation drafting, omission detection." },
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
    >
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
        {STAGES.map((s) => (
          <StageChip key={s.label} {...s} />
        ))}
      </div>
      <p>
        There was a bigger, flashier idea early on: an AI that sits in meetings, sends minutes, tracks owners, a
        full personal-assistant pitch. I dropped it deliberately, not because it was uninteresting, but because
        the same research that grounded the problem statement showed &ldquo;too many meetings&rdquo; was the #1
        complaint from actual game devs. Shipping something that generates more meeting artifacts would have been
        tone-deaf to my own sourcing. I moved the ambition to the roadmap instead of the MVP; the ledger stayed the
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
          <tr><td>Chunk-and-embed RAG</td><td>Wrong unit of meaning. The unit is a claim, not a 512-token window.</td></tr>
          <tr><td>Vector memory store</td><td>Same reasoning: claims are structured records, not embeddings to search</td></tr>
          <tr><td>Multi-agent debate / planning</td><td>Would make regression testing impossible; eval is what this project optimises for</td></tr>
          <tr><td>Real OAuth, real-time streaming</td><td>Out of scope for this build&apos;s surface</td></tr>
        </tbody>
      </table>
      <p className="claim-state-label" style={{ marginTop: "var(--space-2)" }}>
        <code>/settings</code> demonstrates the Stage 3 configuration surface as a real form with real local state.
        Every control is traceable to an actual field in the codebase, but it stays inert by design: wiring it
        live would break the reproducibility guarantee the Evals tab depends on.
      </p>
    </Dimension>
  );
}

function DimensionMethodology() {
  return (
    <Dimension
      n={3}
      title="Applied AI methodology"
    >
      <div className="drilldown" style={{ padding: "var(--space-2)", marginBottom: "var(--space-3)" }}>
        <img
          src="/diagrams/build-process-loop.svg"
          alt="Loop diagram: hands-on product testing surfaces a result that looks wrong or unclear, which gets traced to root cause in source rather than guessed at, then fixed, then verified against the committed eval baseline via npm run eval. If the eval shows a regression, it loops back to root-cause tracing. If it shows zero regressions, the change ships and the loop returns to more hands-on testing."
          style={{ width: "100%", maxWidth: "22rem", height: "auto", display: "block", margin: "0 auto" }}
        />
        <p className="claim-state-label" style={{ marginTop: "var(--space-2)", textAlign: "center" }}>
          The loop I actually worked in, distinct from the running system&apos;s data-flow pipeline on{" "}
          <Link href="/architecture">Architecture</Link>.
        </p>
      </div>

      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        The escalation-router incident
      </h3>
      <p>
        The most surprising thing that happened wasn&apos;t in planning. It was after deployment. A feature I
        added (a confidence-gated escalation router) silently regressed one eval scenario while improving another:
        net zero on correctness, zero buckets ever actually escalated across the full recorded set, and it sat
        live on the deployed site until I caught it by closely reading the eval diff output, not by trusting a
        headline number. I demanded a full investigation before any fix, specifically to know whether this was a
        baseline-freezing artifact or a real logic bug before deciding what to do.
      </p>
      <p>
        Given the investigation, I reverted the router entirely rather than keep the one scenario it had
        &ldquo;improved.&rdquo; Carrying a known, unresolved regression into a submission wasn&apos;t acceptable
        just because the net was zero. I fixed a separate, genuinely diagnosable bug found in the same pass (a
        referent-resolution issue behind one missed contradiction). I left a second failing case reported as an
        honest, documented limitation rather than forcing a fix. One real, understood gap beats something that
        looks artificially perfect. See commit <code>b69ca2d</code>.
      </p>

      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        Concrete choices, not buzzwords
      </h3>
      <ul className="prerule-list">
        <li>
          <strong>Model selection, sequenced and reversible.</strong> Free tier first, deliberately, to prove the
          whole orchestration before spending on a paid model. This shaped the architecture, not just the budget:
          every model call goes through one <code>ModelClient</code> interface, and every implementation (live,
          replay, stub, fallback) satisfies it identically. I confirmed this by grepping for any{" "}
          <code>instanceof</code> check on a concrete client anywhere in the pipeline and finding none. A{" "}
          <code>strong</code> config (Claude Sonnet 5 for adjudication) is already fully plumbed and selectable
          via <code>--config=strong</code>. Swapping the free model for a stronger one later is a config change,
          not a rewrite, and that interface boundary is the receipt, not just the claim.
        </li>
        <li>
          <strong>Context loading is bounded, on purpose.</strong> Extraction sends the prior 3 messages in the
          same thread as context, not the whole thread. That&apos;s enough for a single-claim extraction task,
          without paying for or diluting the call with unbounded history.
        </li>
        <li>
          <strong>No hand-offs between sub-agents.</strong> There is no planner and no sub-agent delegation. The
          pipeline order (gate, extract, resolve, pre-rule, adjudicate, persist) never varies, and nothing decides
          what runs next at runtime. A planner agent choosing the pipeline dynamically would make regression
          testing impossible, and eval quality is explicitly what this project optimises for over agentic
          flexibility.
        </li>
        <li>
          <strong>No git hooks.</strong> Not used in this build. The closer equivalent is a manual discipline:
          every change to the scored pipeline is gated by reading <code>npm run eval</code>&apos;s baseline diff
          before it&apos;s considered done. Same check a pre-commit hook would automate, done by habit instead of
          tooling here.
        </li>
        <li>
          <strong>MCP as the real external-tool boundary.</strong> <code>mcp-server/</code> exposes the fixture
          corpus over stdio as four tools (Slack search/thread, Gmail search/thread), both backed by one shared
          adapter module. Said plainly: the web app doesn&apos;t yet import that same adapter. It reads the
          identical corpus through a separate in-process implementation of the same interface. One interface, two
          call-sites, not yet consolidated. A known next step, not hidden.
        </li>
      </ul>

      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        The free tier has a real rate limit, and it&apos;s enforced, not just documented
      </h3>
      <p>
        Live mode is capped at 10 calls per session per 10 minutes: an in-memory counter keyed to a session
        cookie, not a suggestion. Go over it and the API returns a 429 with &ldquo;Rate limit reached for this
        session (10 live calls per 10 minutes). Try replay mode, or wait.&rdquo; Sandbox&apos;s retry-live button
        hits the exact same counter as a normal run. It asks for more output room per call; it doesn&apos;t get
        more calls.
      </p>
      <p>
        This limit exists for fairness, not because recording the eval fixtures ran into it. The free-tier model
        itself already rate-limits per request regardless of anything in this app, so the counter here just stops
        one person&apos;s live exploration from eating the whole shared quota. Replay being the default mode is a
        separate decision, made for reproducibility: byte-identical results, offline, no API key needed. The two
        facts sit next to each other, but one didn&apos;t cause the other.
      </p>
      <p>
        Gold claims (the labels the adjudication grader is scored against) are hand-labeled by one person: me,
        with no measured agreement from anyone else checking my work. I say that plainly rather than smoothing it
        over. They live in <code>evals/gold-claims.json</code>, and I put the full set on the{" "}
        <Link href="/architecture">Architecture</Link> page, with the real source message behind each one, so a
        reviewer doesn&apos;t have to take &ldquo;gold&rdquo; on faith.
      </p>

      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        Scope discipline near the end
      </h3>
      <p>
        I considered live-configurable temperature/thresholds and a Zapier/Make-style drag-and-drop orchestration
        builder. I dropped the node-builder once it was clear a flashy graph UI would visually misrepresent a
        system that&apos;s mostly deterministic code with only two narrow model calls in it. <code>/settings</code>{" "}
        stayed, but scoped explicitly as a non-functional demonstration surface, protecting the reproducibility
        guarantee the Evals tab depends on rather than trading it for a more impressive-looking page.
      </p>

      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        Shipping it
      </h3>
      <p>
        This is a plain Next.js App Router project, so deploying it is zero-config: no <code>vercel.json</code>,
        no custom build step. I connected the GitHub repo in the Vercel dashboard once, and every push to{" "}
        <code>main</code> auto-deploys from there. Live mode and the AI Gateway key aren&apos;t committed
        anywhere: <code>AI_GATEWAY_API_KEY</code> and <code>LIVE_MODE_ENABLED</code> are set as Vercel project
        environment variables, same as any secret. One thing that caught me: Vercel doesn&apos;t pick up a new
        environment variable on an already-running deployment. Adding one means triggering a fresh deploy, not
        just saving the setting.
      </p>
    </Dimension>
  );
}

function DimensionEvals() {
  return (
    <Dimension
      n={4}
      title="Eval design"
    >
      <p>
        Two graders, never merged. The extraction grader scores the pipeline&apos;s real predicted claims. The
        adjudication grader is fed <strong>gold</strong> claims only, never the extractor&apos;s own output, so a
        bad extraction run can neither mask nor manufacture an adjudication error. Per-scenario results, never
        averaged: a weak spot must not hide behind a healthy mean.
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
        tab. No API key required either way.
      </p>
      <p>
        One scenario (a staged rollout with a stale client cache, where both readings can genuinely be true at
        once) is labeled CONTESTED and excluded from headline scoring entirely, rather than folded into precision
        or recall where it would misrepresent what the system actually got right or wrong.
      </p>
      <p>
        The single best evidence the ledger is stateful, not a pairwise text diff: the flagship launch-date bucket
        evaluated at two points in time. A live contradiction between two people at one snapshot, resolved by
        deterministic authority-based supersession once the studio head&apos;s message lands at the next. Never by
        asking the model to be clever about who outranks whom.
      </p>
      <p className="claim-state-label">
        The reproducibility push itself came from a product judgment, not a technical default. I assumed a
        reviewer wouldn&apos;t run terminal commands, so the eval suite needed to be runnable from the UI, not
        just documented. That decision is why Evals is a first-class in-browser tab today, not a script with a
        results file attached.
      </p>
    </Dimension>
  );
}

function DimensionSystemDesign() {
  return (
    <Dimension
      n={5}
      title="System design accuracy"
    >
      <p>
        <code>npm ci && npm run eval</code> reproduces the same per-scenario numbers on any machine, offline, with
        no API key. Replay is the only mode the eval harness uses: every model call is cached to a committed
        recording, keyed on model, prompt version, and semantic input. The replay boundary is narrow. Only the raw
        model HTTP response is cached; everything else (noise gate, schema/span validation, referent resolution,
        pre-rules, both graders) runs live in every mode. A replay miss is a hard, visible error, never a silent
        fallback. Nothing in the scored pipeline calls <code>Date.now()</code>, enforced by a repo-wide test, so
        evaluation time is a frozen, injected parameter everywhere.
      </p>
      <p>
        <strong>Every model-call implementation shares one interface.</strong> Live, replay, stub, and fallback
        all implement the same <code>ModelClient</code>, and nothing branches on which one it&apos;s holding. The
        pipeline only ever calls <code>model.call(...)</code>. Grepping for an <code>instanceof</code> check on
        any concrete client, anywhere a model gets called, turns up zero. That&apos;s why swapping the free model
        for the already-plumbed strong config is a config change, not a rewrite.
      </p>
      <p>
        <strong>Persistence:</strong> an env var (<code>LEDGER_STORE</code>) picks between a file-backed store,
        which survives a restart, and an in-memory store that matches a warm serverless instance and resets on
        cold start. Both exist because the deployment target determines which guarantee is available, not because
        one is more &ldquo;finished&rdquo; than the other.
      </p>
      <h3 className="section-heading" style={{ fontSize: "var(--size-body)" }}>
        Failure modes, named rather than hidden
      </h3>
      <ul className="prerule-list">
        <li>
          A JSON parse failure falls back to COMPATIBLE, deliberately. This can only ever hurt contradiction
          recall, never inflate the false-positive rate. A conservative failure mode I chose on purpose, not an
          accident.
        </li>
        <li>
          The flagship launch-date transition reproduces on the gold-claims eval path but not on the live-app
          extractor path. One specific message&apos;s live extraction call truncates before finishing, and is
          correctly rejected rather than guessed at. I root-caused it exactly, disclosed it on the live page
          itself, and deliberately didn&apos;t patch it by re-prompting or raising the token cap after seeing the
          result. That would be exactly the kind of post-hoc tuning this project refuses to do.
        </li>
        <li>
          The noise gate&apos;s short-message rule also gates some legitimate short acknowledgements along with
          genuine chatter. An accepted precision/recall tradeoff in the gate itself, reported via a visible
          gated-message count rather than hidden.
        </li>
      </ul>
    </Dimension>
  );
}
