# Quorum — Deck Outline

Three slides. Every number on Slide 3 comes from an actual `npm run eval` run;
nothing else appears. This file is the source content for the slides — build
the actual deck (Google Slides / Keynote / whatever) from this text directly.

---

## Slide 1 — Problem

**Headline:** No tool maintains a model of what a team currently believes to
be true — which is why every assistant that sends meeting notes and
reminders eventually gets muted.

**User:** a PM at a mobile games studio running live ops (Tamarind Games,
fictional — no real company data).

**Trigger:** a message asserts something about a referent — a launch date, a
success metric, a scope decision — where a live claim from a different
person already conflicts with it.

**Outcome:** the conflict surfaces with both source messages and the
reasoning, before it reaches execution.

**Grounded in, attributed, not asserted:**
- Olivier Courtemanche (former EA PM): misaligned definitions of success,
  specs executed without shared reasoning, contested ownership, and a "data
  truth trap" — two people reading the same metric to opposite conclusions.
- Kowalyshyn & Scheutz (Tufts): a taxonomy — unsupported beliefs, false
  beliefs, belief contradictions, omissions — used as a **frame only**;
  their reported percentages are lab-study numbers on a two-person task and
  are not cited as if they transferred to this domain.

**Say plainly:** no games-studio PM was interviewed to validate this. What
would be validated first: whether contradiction (what this system detects)
or omission (what it deliberately does not) is the failure mode PMs notice
first in practice.

**Success criteria**, split by what's measurable now vs. what needs real
studio data:

| Metric | Measurable from this corpus? |
|---|---|
| Detection lead time | Yes |
| Caught before vs. after execution | Yes |
| Time to reconcile | Partially |
| Rework avoided | No — needs studio-supplied revenue/cost inputs |

---

## Slide 2 — Approach

**Stage plan:**
- Stage 1 (ledger) — independently useful on its own; browsable claim
  history per referent, with no contradiction having been detected.
- Stage 2 (adjudication) — earned by Stage 1; runs only on buckets already
  holding 2+ live claims from different people.
- Stage 3 (deferred) — minutes generated from the ledger, owner/ETA
  tracking as ledger reads, gated reconciliation drafting, and omission
  detection (the biggest prize, blocked on a task-state ground truth this
  project doesn't have).

**What was cut, and why (one line each):**
- Fine-tuning — two-tier prompting is enough at this volume and this eval
  surface.
- Chunk-and-embed RAG — wrong unit of meaning; the unit is a claim, not a
  512-token window.
- Vector memory store — same reasoning.
- Multi-agent debate / planning — would make regression testing
  impossible, and eval is what this project optimises for.
- Real OAuth, real-time streaming — out of scope for this build's surface.

**Architecture:**
```
sources → noise gate → extraction → referent resolution → adjudication → ledger → surface
 (fixtures) (deterministic) (cheap model)  (deterministic +   (free model)  (persisted)  (4 tabs)
                                             embeddings,
                                             no LLM call)
```

**The deterministic/model split, concretely:** four of the seven possible
verdicts (`UPDATE`, `RESOLVED_BY_SUPERSESSION`, `RESOLVED_BY_CORRECTION`,
`AMBIGUOUS_REFERENT`) are decided by code, before the model is ever called.
The model answers exactly one question on the remainder: are these live
claims mutually incompatible? This is the deliberate hedge against a weak
free-tier judge, stated as a limitation, not hidden as a strength.

**Model selection.** Both tiers run on `inclusionai/ling-3.0-flash-free`. A
`strong` config (Claude Sonnet 5 for adjudication) is fully plumbed but
unrecorded — no strong-model numbers are claimed anywhere. Separately, the
comparison actually run is judge-scope: binary (code decides four verdicts)
vs. full7 (model decides all seven), both on the free tier — the axis that
was actually varied, honestly reported as such.

**Autonomy:** autonomous in triggering, deterministic in control flow. No
planner agent. Say exactly that.

---

## Slide 3 — Proof and what's next

**Per-scenario results** (never averaged — a weak spot must not hide behind
a healthy mean). From the committed baseline, reproducible via `npm run
eval` (see `evals/baseline.json`'s `reportHash` for the current value):

**Headline:**
- False positive rate: **0/18 = 0** — zero must-not-flag scenarios
  incorrectly flagged.
- Contradiction recall: **6/8**.
- Span validity: **65/65 = 1** — no hallucinated span in this run.

**Adjudication, all 8 scored contradictions + the flagship transition:**

| Scenario | Expected | Actual | Result |
|---|---|---|---|
| C1 launch date @15Jul | CONTRADICTION | CONTRADICTION | OK |
| C2 success criteria | CONTRADICTION | CONTRADICTION | OK |
| C3 sign-off owner | CONTRADICTION | CONTRADICTION | OK |
| C4 D7 retention | CONTRADICTION | COMPATIBLE | miss (label limitation, predicted) |
| C5 tournament scope | CONTRADICTION | CONTRADICTION | OK |
| C6 leaderboard feasibility | CONTRADICTION | COMPATIBLE | miss (referent bug fixed; model rationale exceeds schema cap) |
| C7 build readiness | CONTRADICTION | CONTRADICTION | OK |
| C8 art capacity | CONTRADICTION | CONTRADICTION | OK |
| **N2 flagship @18Jul** | RESOLVED_BY_SUPERSESSION | RESOLVED_BY_SUPERSESSION | **OK — the one that matters most** |
| N3 ambiguous referent | AMBIGUOUS_REFERENT | COMPATIBLE | miss — open question, see README |
| C9 (contested, excluded) | CONTESTED | CONTESTED | OK |

**What actually happened, not just the summary numbers:**
- Predicted N7/N8 (reported speech, negative polarity) would be the free
  model's weak points. **Wrong** — both worked correctly; modality and
  polarity accuracy are 1.0 wherever a claim matched at all.
- What actually went wrong: the free model **over-segments** messages into
  multiple claims and **paraphrases values** enough that exact-match
  scoring correctly refuses several matches (e.g. C7: model says "not
  release-ready," gold says "not ready, open P1" — same fact, different
  words, correctly not force-matched). This is a precision problem, not
  the modality/polarity problem this was expected to be.
- C6 had a real referent-resolution bug — two gold claims about the same
  referent were landing in two different buckets because one claim's
  message never literally says "leaderboard" — found and fixed (see
  README). What remains is a separate, unrelated issue: the free model's
  rationale for this bucket consistently exceeds the schema's 400-char cap
  before finishing, so the parser correctly rejects it and falls back to
  `COMPATIBLE` — the deliberately conservative failure mode, working as
  designed, same as C8's old parse-failure mode used to be before this
  recording happened to succeed cleanly.
- C4 came back `COMPATIBLE` exactly as predicted — different cohorts,
  different baselines, a defensible label limitation, not patched around.
- N3 is an open miss with no clean explanation yet — the referent resolver
  passes its own unit tests on this exact case, so this is a genuine open
  gap needing follow-up debugging, not a rationalised one.

The rules stay fixed regardless of which numbers they produce — a metric a
customer can trust has to hold up before results are known, not be tuned to
them after.

**Roadmap, each item earned by the ledger:**
1. Minutes generated from the ledger — what circulates is what the team
   currently believes, not one meeting in isolation.
2. Owner/ETA tracking as reads against the ledger — can't go stale the way
   a manually maintained dashboard does.
3. Reconciliation drafting — gated for human approval, never auto-sent.
4. Omission detection — the biggest prize, blocked on a task-state ground
   truth Slack and Gmail alone cannot provide.

The `/settings` page demonstrates the configuration surface this stage would
need (model tier, judge scope, authority ranks, noise-gate strictness) as a
real form with real local state — not wired to inference, so the
reproducibility guarantee above holds regardless.

**Close on:** every assistant that captures and reminds eventually gets
muted because it holds no model of what is true. The ledger is what makes
those later features trustworthy — which is why it comes first.
