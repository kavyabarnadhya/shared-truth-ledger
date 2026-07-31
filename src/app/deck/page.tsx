"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

/**
 * Hosted HTML deck: three slides, arrow-key/click navigable, styled with the
 * same globals.css tokens as the rest of Quorum rather than looking like a
 * separate artifact. Content is the same three slides as deck/OUTLINE.md
 * (the native .pptx, built separately, draws from the same source) — the
 * "instrument panel, not marketing deck" rule applies here too: dense, real
 * numbers, no stock imagery, no gradient.
 */

const SLIDE_COUNT = 3;

export default function DeckPage() {
  const [index, setIndex] = useState(0);

  const go = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(SLIDE_COUNT - 1, next)));
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, go]);

  return (
    <main className="page deck-page">
      <div className="deck-page__topbar">
        <Wordmark />
        <Link href="/" className="claim-state-label">
          ← Back to Quorum
        </Link>
      </div>

      <div className="deck-slide" role="group" aria-label={`Slide ${index + 1} of ${SLIDE_COUNT}`}>
        {index === 0 && <SlideProblem />}
        {index === 1 && <SlideApproach />}
        {index === 2 && <SlideProof />}
      </div>

      <div className="deck-page__nav">
        <button onClick={() => go(index - 1)} disabled={index === 0}>
          ← Previous
        </button>
        <span className="claim-state-label">
          Slide {index + 1} / {SLIDE_COUNT} — use ← → arrow keys
        </span>
        <button onClick={() => go(index + 1)} disabled={index === SLIDE_COUNT - 1}>
          Next →
        </button>
      </div>
    </main>
  );
}

function SlideProblem() {
  return (
    <section>
      <h1 className="page-title">1. Problem</h1>
      <p>
        No tool maintains a model of what a team currently believes to be true — which is why every assistant that
        sends meeting notes and reminders eventually gets muted.
      </p>

      <h2 className="section-heading">User</h2>
      <p>A PM at a mobile games studio running live ops (Tamarind Games, fictional — no real company data).</p>

      <h2 className="section-heading">Trigger</h2>
      <p>
        A message asserts something about a referent — a launch date, a success metric, a scope decision — where a
        live claim from a different person already conflicts with it.
      </p>

      <h2 className="section-heading">Outcome</h2>
      <p>The conflict surfaces with both source messages and the reasoning, before it reaches execution.</p>

      <h2 className="section-heading">Grounded in, attributed, not asserted</h2>
      <ul className="prerule-list">
        <li>
          Olivier Courtemanche (former EA PM): misaligned definitions of success, specs executed without shared
          reasoning, contested ownership, and a &ldquo;data truth trap&rdquo; — two people reading the same metric to
          opposite conclusions.
        </li>
        <li>
          Kowalyshyn &amp; Scheutz (Tufts): a taxonomy — unsupported beliefs, false beliefs, belief contradictions,
          omissions — used as a frame only; their reported percentages are lab-study numbers on a two-person task and
          are not cited as if they transferred to this domain.
        </li>
      </ul>

      <h2 className="section-heading">Success criteria</h2>
      <table className="claim-table">
        <thead>
          <tr>
            <th>Metric</th>
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
    </section>
  );
}

function SlideApproach() {
  return (
    <section>
      <h1 className="page-title">2. Approach</h1>

      <h2 className="section-heading">Stage plan</h2>
      <ul className="prerule-list">
        <li>Stage 1 (ledger) — independently useful on its own; browsable claim history per referent, with no contradiction having been detected.</li>
        <li>Stage 2 (adjudication) — earned by Stage 1; runs only on buckets already holding 2+ live claims from different people.</li>
        <li>Stage 3 (deferred) — minutes generated from the ledger, owner/ETA tracking as ledger reads, gated reconciliation drafting, and omission detection.</li>
      </ul>

      <h2 className="section-heading">Architecture</h2>
      <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: "var(--size-caption)" }}>
        sources → noise gate → extraction → referent resolution → pre-rules → adjudication (+ escalation router) → ledger → surface
      </pre>

      <h2 className="section-heading">The deterministic/model split</h2>
      <p>
        Four of the seven possible verdicts (UPDATE, RESOLVED_BY_SUPERSESSION, RESOLVED_BY_CORRECTION,
        AMBIGUOUS_REFERENT) are decided by code, before the model is ever called. The model answers exactly one
        question on the remainder: are these live claims mutually incompatible? This is the deliberate hedge against
        a weak free-tier judge, stated as a limitation, not hidden as a strength.
      </p>

      <h2 className="section-heading">Model selection</h2>
      <p>
        Both tiers on <code>inclusionai/ling-3.0-flash-free</code> — including a confidence-gated escalation router:
        when the primary binary call self-reports confidence below a fixed threshold, a second call with a
        step-by-step reasoning prompt runs and its verdict wins if produced. A <code>strong</code> config
        (Claude Sonnet 5 for adjudication) is fully plumbed but unrecorded — no strong-model numbers are claimed.
      </p>

      <h2 className="section-heading">Autonomy</h2>
      <p>Autonomous in triggering, deterministic in control flow. No planner agent.</p>
    </section>
  );
}

function SlideProof() {
  return (
    <section>
      <h1 className="page-title">3. Proof and what&apos;s next</h1>
      <p className="claim-state-label">
        Per-scenario results, never averaged. Reproducible via <code>npm run eval</code>. See the Evals tab for the
        live, browser-run version of this exact table, including the escalation router&apos;s measured effect.
      </p>

      <h2 className="section-heading">Headline</h2>
      <div className="headline-row">
        <div className="headline-item">
          <span className="headline-item__label">False positive rate</span>
          <span className="headline-fraction">0/18 = 0</span>
        </div>
        <div className="headline-item">
          <span className="headline-item__label">Contradiction recall</span>
          <span className="headline-fraction">5/8</span>
        </div>
        <div className="headline-item">
          <span className="headline-item__label">Span validity</span>
          <span className="headline-fraction">65/65 = 1</span>
        </div>
      </div>

      <h2 className="section-heading">Honest findings</h2>
      <ul className="prerule-list">
        <li>Predicted N7/N8 (reported speech, negative polarity) would be the free model&apos;s weak points — wrong; both worked correctly.</li>
        <li>What actually went wrong: the free model over-segments messages and paraphrases values enough that exact-match scoring correctly refuses several matches — a precision problem, not a modality/polarity problem.</li>
        <li>One message (M-070) returned prose instead of JSON; the repair ladder correctly rejected it and fell back to COMPATIBLE — the deliberately conservative failure mode, working as designed.</li>
        <li>N3 is an open miss with no clean explanation yet — reported as a genuine gap, not rationalised.</li>
      </ul>
      <p className="claim-state-label">No hand-written rule was added in response to any of these numbers.</p>

      <h2 className="section-heading">Escalation router — measured, not asserted</h2>
      <p>
        Across the full recorded set, 0 buckets self-reported confidence below the fixed 0.6 threshold, so the
        escalated call never fired — the honest result, not adjusted to force a nonzero count. Re-recording the
        binary prompt to add that self-report surfaced one prompt-induced regression on a previously-correct bucket
        (<code>reward_config.tiers</code>): the new response came back confidently wrong (confidence 0.9,{" "}
        <code>COMPATIBLE</code> instead of <code>CONTRADICTION</code>), which the router cannot rescue since 0.9 is
        above threshold. Found, not hidden — the baseline above was deliberately not re-frozen over it, and fixing
        the regression is unresolved follow-up work.
      </p>

      <h2 className="section-heading">Roadmap</h2>
      <ul className="prerule-list">
        <li>Minutes generated from the ledger.</li>
        <li>Owner/ETA tracking as reads against the ledger.</li>
        <li>Reconciliation drafting — gated for human approval, never auto-sent.</li>
        <li>Omission detection — blocked on task-state ground truth this corpus doesn&apos;t have.</li>
      </ul>
    </section>
  );
}
