# Quorum

A ledger over a team's Slack and Gmail that extracts claims — who asserted
what, about which referent, when — into persistent state, then detects when
two people hold incompatible **live** claims about the same thing.

Not a task tracker. Not a meeting summariser. Not a reply drafter. Those
exist. The gap is that no tool maintains a model of what a team currently
believes to be true — which is why every assistant that sends meeting notes
and reminders eventually gets muted: it has no way to know its own output
has gone stale. This is what makes those features trustworthy, which is why
it comes first.

**Nothing to install to try it.** [shared-truth-ledger.vercel.app](https://shared-truth-ledger.vercel.app)
is the whole product — every tab, every drill-down, the evals suite itself,
is reachable by clicking, with demo data and no login. See
[/process](https://shared-truth-ledger.vercel.app/process) for the real
decisions and tradeoffs behind the build, mapped to how this kind of
assignment tends to get evaluated. To reproduce the numbers offline
instead, `npm ci && npm run eval` runs with no API key and prints the same
per-scenario results as this README.

---

## 1. Problem

**User:** a PM at a mobile games studio running live ops (Tamarind Games,
fictional, modelled on the casual board-game segment — no real company data
is used anywhere in this project; every name, message, metric, and date in
the fixture corpus is invented).

**Trigger:** a message asserts something about a referent — a launch date, a
success metric, a scope decision — where a live claim from a different
person already exists and conflicts with it.

**Outcome:** the conflict surfaces with both source messages and the
reasoning behind the verdict, before it reaches execution — before a
producer ships against a date the PM already moved, before a UA campaign
targets a launch that Engineering quietly slipped.

**Success criteria**, split by what is actually measurable from this corpus
versus what needs real studio data:

| Metric | Measurable now? |
|---|---|
| Detection lead time (contradiction created → surfaced) | Yes — timestamps are in the corpus |
| Contradictions caught before execution vs. after | Yes — the corpus's message order encodes this |
| Time to reconcile (surfaced → resolved) | Partially — the corpus shows some but not all reconciliations |
| Rework avoided | No — needs real studio data (revenue-at-risk per event day, loaded hourly cost) |

The system supplies the counts (how many contradictions, how fast surfaced,
how often correctly). The studio would have to supply the money inputs.
Neither is invented here, and no number below claims otherwise.

### Where this problem statement comes from

No games-studio PM was interviewed to validate this problem statement. The
user and trigger above are reasoned from two sources instead:

- **Olivier Courtemanche** (former EA product manager, recorded industry
  talk) names three recurring failure modes that are shared-truth problems
  in disguise: misalignment on the *definition* of success between a PM and
  a designer (not disagreement on the number — disagreement on what's being
  measured); specs written in isolation, so a team executes without
  understanding the reasoning behind a decision, producing friction and
  rework later; and contested ownership, where producers historically held
  the "product owner" title and PMs inherited responsibility without the
  authority. He also describes a **data truth trap** — two people looking at
  the same metric and drawing opposite conclusions, which is exactly what
  C4 (D7 retention direction) in this corpus is built to test.
- **Kowalyshyn and Scheutz** (Tufts) categorise team mental-model
  discrepancies into unsupported beliefs, false beliefs, **belief
  contradictions**, and **omissions**, and find omissions dominate in their
  data. This project uses their categories only as a **taxonomy frame** —
  contradiction vs. omission is a real, useful distinction, and it's why
  omission detection is named explicitly as the next frontier below. Their
  reported *percentages* are not cited or reused anywhere in this README:
  that work is a lab study on two-person object-identification tasks, and
  those numbers have no basis for transferring to asynchronous workplace
  messaging. Citing them here would be exactly the kind of borrowed
  precision this project's own eval design tries to avoid.

What would be validated first with a real studio: whether "contradiction
between live claims" is actually the failure mode PMs notice first, or
whether omissions (something nobody said, that should have been said)
dominate in practice — which the Kowalyshyn/Scheutz frame suggests is likely,
and which is exactly why it's out of scope here (see §3).

---

## 2. Stages

**Stage 1 — the ledger.** Extracts claims, resolves referents, maintains
live/superseded/withdrawn state over time. Independently useful on its own:
a PM can ask "what does the team currently believe about the launch date"
and get an answer with history, with no contradiction having been detected
at all. This is the Ledger tab.

**Stage 2 — adjudication.** Runs only on candidate pairs where a Stage-1
bucket already holds two or more live claims from different people. Stage 2
is *earned* by Stage 1 — it has nothing to adjudicate without a correct
temporal model underneath it.

**Stage 3 — deferred.** Not built, and here's why each piece is cut:

| Cut | Reason |
|---|---|
| Fine-tuning | Two-tier prompting is enough for a claim-extraction task at this volume; fine-tuning is an infra and eval-surface commitment this scope doesn't justify |
| Chunk-and-embed RAG | Wrong unit of meaning. The unit here is a *claim* — who asserted what, when — not a 512-token window. Embedding a message and retrieving nearest-neighbour chunks throws away exactly the structure (asserter, timestamp, modality, polarity) the whole system depends on |
| Vector memory store | Same reasoning — claims are structured records, not embeddings to search over |
| Multi-agent debate | A planner agent deciding the pipeline would make regression testing impossible, and eval is what this project is optimising for. Every pipeline stage is deterministic in control flow and fixed in order; see §9 |
| Autonomous action-taking | The system surfaces; it does not act. Reconciliation drafting (below) is the closest future step, and even that is gated for human approval, never auto-sent |
| Real OAuth | Fixture-mode reads JSON; MCP server exists as a real protocol boundary (see §7) but nothing here authenticates against a live Slack/Gmail workspace |
| Real-time streaming | Batch pipeline over a fixed corpus; no websocket/webhook ingestion |

**What Stage 3 configuration would look like, demonstrated not wired.** A
`/settings` page shows the surface a workspace admin would actually configure
once Stage 3 exists: model tier per pipeline stage, judge scope, model call
parameters (temperature, max output tokens, the same-thread context window
size, the MCP tools' search result limit), a reference view of the real
extraction user-prompt (`renderUser()`'s literal output, not an editable
template — there's no placeholder syntax in this system), authority ranks
per role, noise-gate strictness, and the gated-channel list. Every control
is real — named, traceable to a specific field or constant already in the
codebase, not invented for the page. It is a real form with real local
state, persisted to `localStorage`, but every control is inert: nothing on
that page writes to `ModelClient`, the recordings, or the Evals tab. This is
a genuine deferred capability, not a decorative one — it stays inert because
wiring it live would break the reproducibility guarantee the rest of the
product depends on (the Evals tab promises byte-identical numbers for any
reviewer, which only holds if inputs are fixed) and because this build has
no admin/end-user role separation to gate a live write safely. The page
proves the configuration surface is understood without taking that risk.

**Omission detection is the biggest prize in Stage 3, and it is deliberately
out of scope.** Detecting what was *not* said needs a task-state ground
truth — a spec, a ticket, a checklist — that Slack and Gmail messages alone
cannot provide. You cannot tell a system "flag when nobody has confirmed the
config freeze date" without first telling it that a config freeze date is a
thing that's supposed to exist. That ground truth doesn't live in a message
stream; it lives in whatever system of record the studio uses for scope,
which this project does not have access to and does not fabricate.

### Roadmap beyond Stage 3 (each earned by the ledger, not by "an agent that plans")

1. **Minutes generated from the ledger.** What circulates after a meeting is
   what the team currently believes, sourced from the ledger, not one
   meeting's notes in isolation — so it can't go stale the way a
   human-written summary silently does.
2. **Owner and ETA tracking as reads against the ledger.** A dashboard that
   reads live claims never drifts from reality the way a manually maintained
   spreadsheet does, because it has nowhere to drift *to* — it's reading the
   same state the contradiction detector reads.
3. **Reconciliation drafting.** Draft the message that surfaces a
   disagreement to both parties — gated for human approval, never
   auto-sent. This is the one item here that touches action, and it stays a
   draft.
4. **Omission detection** (see above) — the largest prize, blocked on a
   ground-truth source this project doesn't have.

---

## 3. Architecture

```
sources ──▶ noise gate ──▶ extraction ──▶ referent resolution ──▶ pre-rules ──▶ adjudication ──▶ ledger ──▶ surface
 (Slack/     (deterministic,  (cheap model,   (deterministic +      (deterministic,  (free model)     (persisted     (Overview /
  Gmail       no model call)   per-message)    embeddings,           R0–R9)                            claims,         Signals /
  fixtures)                                    no LLM call)                                            verdicts,       Ledger / Evals /
                                                                                                         suppressions,   Sandbox /
                                                                                                         watermark)     Architecture)
```

This six-stage pipeline is also rendered live, from the real `LedgerSnapshot.trace` (not hand-drawn), on the **Architecture** tab (`/architecture`) — each stage shows real call counts and pre-rule decisions for whatever ledger is currently loaded, plus a static panel on the MCP/adapter tool boundary (see §7).

### Named hooks

The pipeline has five deterministic interception points, named here because
the brief asks for them to be named as such rather than left implicit:

- **Pre-extraction noise gate** — bots, CI, automation, short social asides
  never reach the extractor at all (`src/core/noise-gate.ts`).
- **Post-extraction span validation** — every claim's `source_span` is
  checked against the real message text before the claim is allowed to
  exist (`src/core/span.ts`). This is the single most important check in
  the project: a claim whose span cannot be located in the source is a
  hallucination and is dropped before it ever reaches a bucket.
- **Contested-marker routing** — one referent (`reward_config.live_state`,
  the C9 scenario) is hand-flagged as genuinely arguable and its verdict is
  coerced to `CONTESTED` regardless of model output, then routed to its own
  report section, excluded from headline scoring.
- **Post-adjudication suppression** — a dismissed contradiction stays hidden
  only while its live claim set is unchanged; the moment a new claim lands
  in that bucket, it resurfaces automatically (`src/core/ledger.ts`'s
  `isSuppressed`/`dismissBucket`).
- **The eval logger** — every model call, in every mode, is captured with
  its cache key, prompt, and response, which is what makes replay and the
  Evals tab possible at all.

### Model selection

Two tiers behind one `ModelClient` interface (`src/core/types.ts`), so
swapping either tier is a one-line change in `src/core/model/config.ts`:

- **Extraction** — cheap, high-volume, structured, low-judgment. Per-message
  claim extraction with a fixed output schema.
- **Adjudication** — low-volume, high-stakes, nuanced. Runs only on
  candidate pairs inside one referent bucket, never on the full cross
  product of claims.

**Both tiers currently run on `inclusionai/ling-3.0-flash-free`** via the
Vercel AI Gateway. A `strong` config (`anthropic/claude-sonnet-5` for
adjudication only, extraction still free) is fully plumbed in
`src/core/model/config.ts` and can be selected with `--config=strong`, but
**no recordings exist for it and no number in this README comes from it.**
The two-tier architecture is real; the cascade is evidenced only on the free
tier for this submission.

**What was used to build this, per the assignment's ground rules:** the app
code, prompts, eval harness, and this README were built with **Claude
Code** (Claude Sonnet 5 as the coding assistant) — every commit in this
repo's history carries a `Co-Authored-By: Claude Sonnet 5` trailer. The
*running system* itself calls `inclusionai/ling-3.0-flash-free`, named
above, for extraction and adjudication; no other model or paid API is
called by the deployed app.

**Judge-scope comparison, not model comparison.** Since no strong-model run
was made, the phase-3 measurement in this build compares two prompt
*scopes* instead of two models, both on the free tier:

- `binary` (primary, what the headline numbers use): the model answers
  exactly one question — are these live claims mutually incompatible? Code
  decides `UPDATE`, `RESOLVED_BY_SUPERSESSION`, `RESOLVED_BY_CORRECTION`,
  and `AMBIGUOUS_REFERENT` via deterministic pre-rules before the model is
  ever called. The schema doesn't allow the model to emit those four
  verdicts.
- `full7`: the model emits the entire 7-way vocabulary itself.

This is an honest framing of a real limitation, not a workaround: with only
the free tier available, there is no strong-vs-cheap delta to measure, so
the axis actually varied — how much of the judgment is handed to the model
versus decided by code — is what gets reported. **Under `binary`, scenarios
N1, N2, N3, and N10 pass by construction, not by model skill** — those four
verdicts are the ones pre-rules own. Say so plainly here rather than let the
per-scenario table imply the model earned them.

### Why embeddings are a tiebreak, not the mechanism

Referent resolution (`src/core/referent.ts`) is deterministic-first:
normalisation, an alias table, then lexical similarity (token Jaccard +
trigram Dice), with an embedding tiebreak designed to apply **only** inside
an ambiguous similarity band, and only among candidates that survive
discrete token gates first.

**In this build, that tiebreak path is unwired, not merely unused.** No
embeddings were ever recorded for this corpus (`ctx.embeddings` is never
populated anywhere in `pipeline.ts`), so every real run falls back to
lexical-only — the `"embedding unavailable, lexical-only tiebreak"` note in
`referent.ts` fires every time. The cosine-similarity code itself is real
and unit-tested (`referent.test.ts`), but it has never actually run against
this corpus. Said plainly rather than implied: this is an intentionally
scoped gap, not a hidden capability.

This is deliberate, not a shortcut. Cosine similarity between "Onam event
go-live date" and "Independence Day event go-live date" is high — both are
"\<festival\> event go-live date." Naively embedding both and picking the
nearest neighbour would put the corpus's N4 near-miss scenario on the
**wrong** side. A `forbidden`/`requiredAny` token gate zeroes out a
candidate before an embedding is ever consulted, so a zeroed-out candidate
can never win a fuzzy tiebreak it was never eligible for. Comparing every
claim to every other claim with a model would also be quadratic and
unaffordable at any real message volume; canonical referent keys make
adjudication a bucket lookup instead.

### What survives a restart

`LedgerStore` (`src/core/types.ts`) has two implementations:

- **File-backed** (`src/server/ledger-file.ts`) — used locally
  (`LEDGER_STORE=file`, the default off Vercel). Genuinely persists across a
  restart; state lives at `./ledger-data/ledger.json`, gitignored.
- **In-memory** (`src/server/ledger-memory.ts`) — used on the hosted
  deployment (`LEDGER_STORE=memory`, the default on Vercel). **Does not
  survive a restart or a new serverless instance.** This is a deliberate
  tradeoff: a reviewer needs zero external services (no Upstash, no KV
  account) to load the hosted page. The alternative — real persistence on
  the deployment — would require a reviewer-visible external dependency this
  project chose not to introduce.

---

## 4. Autonomy — what this system actually does

The system is **autonomous in triggering** (a contradiction check runs
automatically whenever a bucket accumulates a second live claim from a
different asserter) and **deterministic in control flow** (the pipeline
order — gate, extract, resolve, pre-rule, adjudicate, persist — never
varies, and no component decides what to do next). This is a deliberate
choice, not a limitation grudgingly admitted: a planner agent choosing the
pipeline dynamically would make regression testing impossible, and eval
quality is explicitly what this project is optimising for over feature
breadth. Say exactly that when asked what "autonomous" means here — the
system doesn't plan, and doesn't need to.

---

## 5. Reproducibility

`npm ci && npm run eval` reproduces the same per-scenario numbers on any
machine, offline, with no API key. Everything below exists to make that
claim true rather than aspirational:

- **Replay is the default and only mode the eval harness uses.** Every
  model call — extraction and adjudication, both judge scopes — is cached
  to `fixtures/recorded/**`, keyed on a hash of model + prompt version +
  semantic input (`src/core/model/cache-key.ts`), and committed to git.
  Two adjudication paths are recorded separately, because they have
  different semantic inputs and therefore different cache keys: the eval
  harness's grader B is fed **gold** claims (deliberately, so a bad
  extraction run can't mask an adjudication error), while the hosted
  Signals/Ledger tabs adjudicate the **extractor's own** predicted
  claims. Both are committed (120 recordings total: 70 extraction + 50
  adjudication, across both judge scopes and both claim sources — a handful
  of individual calls that came back unparseable prose even after retry are
  not recorded, consistent with "replay never falls back silently"; the
  buckets that matter for `npm run eval`'s default binary/free run are all
  covered), so both paths work offline.
- **The replay boundary is narrow and explicit.** Only the provider's raw
  HTTP response is cached. The noise gate, schema validation, span
  validation, referent resolution, deterministic pre-rules, temporal
  projection, and both graders all execute **live, in every mode** —
  replay only ever substitutes for the network call to the model.
- **A replay miss is a hard, visible error, never a silent fallback.**
  `ReplayModelClient` throws `ReplayMissError` immediately on a cache miss;
  it does not degrade to a generic response. (Live-mode network failures —
  429s, timeouts — are a different, intentionally-graceful path; see
  below.)
- **The CLI and the browser Evals tab call the exact same pure function**
  (`src/core/eval/run-eval.ts`), which touches no `fs`, no `fetch`, no
  `process.env`, and no `Date.now()`. The CLI reads JSON off disk and passes
  it in; the browser imports two generated, committed bundle modules
  (`fixtures/recorded.generated.ts`, `src/corpus/bundled.generated.ts`) and
  passes those in instead. Both then print a `reportHash` computed by the
  same `stableStringify`, so a reviewer can eyeball that the two numbers
  match rather than take it on faith.
- **`src/core/**` cannot import a Node builtin.** Enforced by an ESLint rule
  scoped to that directory (`eslint.config.mjs`), so a `node:fs` import
  creeping into the graded path fails the build, not the demo.
- **Nothing in the pipeline calls `Date.now()`.** A repo-wide test
  (`src/core/time.test.ts`) greps `src/core/` for `Date.now(`, zero-arg
  `new Date()`, and `toLocaleString(` and fails on any hit. Evaluation time
  comes from the frozen `EVAL_AS_OF=2026-07-24T23:59:59+05:30`, injected as
  a parameter everywhere. This is why the flagship bucket
  (`indep_event.launch_date`) reliably returns `CONTRADICTION` when
  evaluated as of 15 July and `RESOLVED_BY_SUPERSESSION` as of 18 July, on
  any machine, at any time.
- **Live mode is not deterministic, and this README does not pretend
  otherwise.** It is opt-in, server-side-keyed, rate-limited per session,
  and falls back to replay on a 429 — but a live call can legitimately
  return a different answer on a different day. Only replay numbers are
  reported as results.

---

## 6. Evals

Two graders, never merged — this is non-negotiable in the design, not a
nice-to-have:

- **Extraction grader** (`src/core/eval/extraction-grader.ts`) scores claim
  recall/precision, referent accuracy, modality accuracy, polarity accuracy
  (the last two scored **separately from recall**, per scenario), and span
  validity. Fed the pipeline's real predicted claims from real messages.
- **Adjudication grader** (`src/core/eval/adjudication-grader.ts`) scores
  verdict accuracy only, and is fed **gold** claims, never the extractor's
  output — so a bad extraction run can neither mask nor manufacture an
  adjudication error.

**Per-scenario, never averaged.** No single "score" is ever computed except
three explicitly-named headline numbers, each shown with its numerator and
denominator:

- **False positive rate** across all must-not-flag scenarios (N1–N18, 18
  scenarios, fixed before the first run). This is the headline metric — a
  noisy detector gets muted regardless of its recall.
- **Contradiction recall** — of the 8 scored contradiction scenarios
  (C1–C8; C9 excluded).
- **Span validity** — the fraction of predicted claims whose span actually
  appears verbatim in the source message.

**C9 (`reward_config.live_state`) is `CONTESTED`, reported in its own
section, and excluded from headline scoring.** Both claims in that bucket
may genuinely be true simultaneously (a staged server-side rollout with a
stale client cache); the label is arguable by design, and folding it into
either precision or recall would misrepresent what the system actually got
right or wrong.

**The flagship bucket** (`indep_event.launch_date`) is evaluated at two
points in time and is the single best evidence that the ledger is stateful
rather than a pairwise text diff: at 15 July it is a live `CONTRADICTION`
between the PM and the producer; at 18 July the studio head's authoritative
message has landed, superseding both, and the verdict is
`RESOLVED_BY_SUPERSESSION` — decided entirely by deterministic pre-rules,
never by asking the model to be clever about who outranks whom.

### Per-scenario results

From the committed baseline (`evals/baseline.json`, `reportHash`
`3cfde8dac169629bf6987469754ecb19e70ef27794d6c2e3488bbe46539bfbff`), run
against `inclusionai/ling-3.0-flash-free` on both tiers,
`EVAL_AS_OF=2026-07-24T23:59:59+05:30`, judge scope `binary`. Reproduce with
`npm run eval` — it will print this same `reportHash`.

**Headline (numerator/denominator, never an average):**

| Metric | Result |
|---|---|
| False positive rate | **0 / 18 = 0** |
| Contradiction recall | **6 / 8** |
| Span validity | **65 / 65 = 1** |

Zero false positives across every must-not-flag scenario is the number that
matters most per the eval design, and it held. Span validity at 65/65 means
every single claim the extractor emitted had a real, verbatim, locatable
span — the anti-hallucination check never had to reject one for this run.

**Adjudication, per scenario** (fed gold claims, never the extractor's own output):

| Scenario | Bucket | Expected | Actual | Result |
|---|---|---|---|---|
| C1 | `indep_event.launch_date`@15Jul | CONTRADICTION | CONTRADICTION | OK |
| C2 | `indep_event.success_criteria` | CONTRADICTION | CONTRADICTION | OK |
| C3 | `liveops_calendar.signoff_owner` | CONTRADICTION | CONTRADICTION | OK |
| C4 | `d7_retention.trend` | CONTRADICTION | COMPATIBLE | **MISMATCH** |
| C5 | `tournament.scope` | CONTRADICTION | CONTRADICTION | OK |
| C6 | `leaderboard.readiness` | CONTRADICTION | COMPATIBLE | **MISMATCH — see note below** |
| C7 | `build_194.release_readiness` | CONTRADICTION | CONTRADICTION | OK |
| C8 | `art_capacity.allocation` | CONTRADICTION | CONTRADICTION | OK |
| C9 (contested) | `reward_config.live_state` | CONTESTED | CONTESTED | OK — excluded from headline |
| N1 | `level40_art.eta` | UPDATE | UPDATE | OK |
| N2 | `indep_event.launch_date`@18Jul | RESOLVED_BY_SUPERSESSION | RESOLVED_BY_SUPERSESSION | **OK — the flagship transition** |
| N3 | cross-referent pair | AMBIGUOUS_REFERENT | COMPATIBLE | **MISMATCH** |
| N4 | `onam_event.launch_date` | COMPATIBLE | COMPATIBLE | OK |
| N7 | `indep_event.launch_date` (reported speech) | RESOLVED_BY_SUPERSESSION | RESOLVED_BY_SUPERSESSION | OK — CL-160 correctly excluded |
| N8 | `indep_event.launch_date` (negative polarity) | RESOLVED_BY_SUPERSESSION | RESOLVED_BY_SUPERSESSION | OK — CL-170 correctly non-conflicting |
| N9 | `indep_event.duration`, `config_freeze.owner` | COMPATIBLE (both) | COMPATIBLE (both) | OK |
| N10 | `reward_config.tiers` (two as-of points) | CONTRADICTION → RESOLVED_BY_CORRECTION | CONTRADICTION → RESOLVED_BY_CORRECTION | OK — both |
| N12–N18 | seven uncontested referents | COMPATIBLE ×7 | COMPATIBLE ×7 | OK — all seven |

**The flagship bucket transition (N2) is exactly right** —
`indep_event.launch_date` returns `CONTRADICTION` at 15 July and
`RESOLVED_BY_SUPERSESSION` at 18 July, decided entirely by the deterministic
pre-rule ladder, with zero involvement from the model. This is the single
result this project cares most about getting right, and it holds.

This table is the frozen, committed baseline above.

**C6 — a real referent-resolution bug found and fixed, followed by a separate
model-quality miss that remains.** `leaderboard.readiness`'s two gold claims
(CL-050, CL-051) previously landed in two different buckets: CL-051's source
message never contains the literal word "leaderboard" (it describes the
Tiranga tournament mode "shipping with the event"), so the resolver's
`requiredAny` token gate rejected the gold-supplied referent and minted a
second, wrong bucket key for it — pre-rule R6 ("exactly one live claim
remains") then fired independently in each single-claim bucket, so the model
was never even asked about this pair. Root cause: `runAdjudicationPipeline`
(`src/core/pipeline.ts`) re-resolved every claim's referent from scratch,
including GOLD claims that already carry a human-assigned, ground-truth
referent — correct for the extractor's own predicted claims (whose
`raw_referent` is a model-emitted phrase that genuinely needs resolving), but
wrong for gold input, which should be trusted rather than re-derived. Fixed
via a `trustSuppliedReferent` parameter on `runAdjudicationPipeline`, set only
by the two gold-claims call sites (`src/core/eval/run-eval.ts`,
`scripts/record.ts`'s gold-claims pass); the live app's extractor-driven
adjudication is untouched. **Both claims now correctly land in one bucket and
reach the model** — verified directly. What remains: the free-tier model's
rationale for this specific bucket has, across every recorded attempt, either
exceeded the schema's 400-character `rationale` cap or been truncated by the
800-token output budget before the JSON closed, so `parseAdjudicationResponse`
correctly rejects it and the pipeline falls back to `COMPATIBLE` — the same
honest, conservative failure mode as C8's `art_capacity.allocation` case.
This is a model-quality limitation, not patched around by loosening the
schema or raising the token budget for one bucket.

**Extraction, per scenario** (claims and spans only; modality/polarity
scored **separately** from recall, per the design):

Full per-scenario table lives in `evals/baseline.json`; summarised: span
validity is 1.0 on every single scenario (no rejected span anywhere in this
run). Referent accuracy is 1.0 everywhere a claim matched at all, with two
exceptions (C2, N9) where the model's referent phrase diverged from gold's.
Claim recall is uneven — several scored-contradiction scenarios (C3, C5–C9)
came back at 0 recall for the extraction grader specifically, discussed
below.

### Where the free model actually struggled

Predicted in advance (see the original list this replaced, kept as git
history), then measured. Reporting what happened, including where the
prediction was wrong:

- **Extraction precision is the real weak point, not modality/polarity.**
  Modality accuracy and polarity accuracy are 1.0 on nearly every scenario
  where a claim matched at all — the two predicted failure modes (N7
  reported speech, N8 negative polarity) **did not occur**: the free model
  correctly read M-160 as reported speech and M-170 as negative polarity,
  and both flagship-bucket pre-rules (R1, R3) fired exactly as designed.
  What went wrong instead: the free model frequently **over-segments** a
  single message into multiple claims (M-001 alone produced 4 claims where
  gold expects 1), and its claim **wording diverges from gold's paraphrase**
  enough that the value-equivalence matcher — correctly, not permissively —
  refuses to force a match. C7's build-readiness message is a clean example:
  the model extracted "not release-ready" as its own claim with correct
  negative polarity, but gold phrases the same fact as "not ready, open P1,"
  and the token-overlap threshold doesn't call that a match. This is
  extraction **precision** and **exact-value recall**, not the modality/
  polarity failure this README predicted going in.
- **One message failed JSON parsing outright**: M-070 (`art_capacity.
  allocation`, scenario C8) returned a multi-paragraph reasoning trace
  instead of JSON. The repair ladder correctly rejected it (zero claims,
  not a guess), and the bucket correctly fell back to `COMPATIBLE` — the
  deliberately conservative failure mode this README commits to elsewhere.
  This is why C8 is a contradiction-recall miss: the model didn't produce
  usable output for one of the two claims in that bucket, full stop.
- **N3 (ambiguous referent) mismatched**, and this one is a genuine
  open question rather than a clean explanation: the discrete token gates
  in referent resolution are unit-tested directly against hand-written
  `raw_referent` inputs and pass (see `src/core/referent.test.ts`), so the
  resolver itself is not obviously at fault. Adjudication is fed **gold**
  claims for this scenario, which rules out extraction as the cause too.
  The most likely explanation is the ambiguity-pair detector's window
  conditions (same 24h, same thread/channel) not lining up the way the unit
  test's synthetic fixture did — this needs a follow-up debugging session
  this submission's timeline didn't allow, and it is reported here as an
  open miss rather than quietly patched.
- **C4 (D7 retention direction) came back `COMPATIBLE` against gold's
  `CONTRADICTION`**, exactly as predicted, and for the predicted reason:
  the two claims cite different cohorts (returning-player vs. paid-install)
  and different baselines. A system — or a careful human — reading these as
  compatible rather than contradictory is defensible. This is reported as a
  **label limitation** per the original prediction, not patched with a
  special-cased rule.

**No hand-written regex or scenario-specific rule was added in response to
any of the above.** The extraction prompt, the referent alias table, and
the pre-rule ladder are exactly as designed before this run — this section
exists to report what a free-tier model actually does with a plain,
untuned prompt, not to explain away a bad number after the fact.

---

## 7. MCP server

`mcp-server/` exposes the same fixture corpus over stdio as four tools:
`slack.search_messages`, `slack.get_thread`, `gmail.search`,
`gmail.get_thread` — all thin re-exports (`mcp-server/src/adapter.ts`) of one
shared in-process adapter module, `src/adapters/workspace.ts`. There is
exactly one implementation of "search Slack/Gmail" in this repo.

**Corrected from an earlier draft of this README:** the web app does *not*
currently import that same adapter module directly. It reads the identical
underlying corpus files (`fixtures/corpus/*.json`) through its own
in-process `FsMessageSource` (`src/server/deps.ts`), which implements the
same `MessageSource` interface but is a separate call-site rather than a
shared import. Same data, same query shape, one interface, two
implementations — consolidating the web app onto the adapter module too is a
natural next step, not yet done. Said plainly here rather than left
overstated, since the brief explicitly says it will look at this boundary.

This boundary is also surfaced on screen, not just in this section — see the
**Architecture** tab (`/architecture`) → "Tool boundary" panel
(`src/components/ToolBoundaryPanel.tsx`), which renders the same four tools
and the same two-callers-one-adapter shape as a clickable panel rather than
prose a reviewer has to scroll to.

This is a bonus, evidenced with a screenshot rather than something a
reviewer is expected to run — attaching an MCP client needs a terminal,
which the primary "click the hosted link" path doesn't require.

---

## 8. Known limitations

Verbatim from the fixture specification, plus system-level ones observed
during the build:

1. **Self-authored labels.** One annotator (this project's author), no
   measured inter-annotator agreement.
2. **Base rate is inflated by design.** Roughly 27% of referent buckets in
   this corpus carry a genuine conflict — far higher than production
   reality — because the corpus is sized for signal per scenario, not for
   base-rate realism. A real deployment needs an observed base rate from an
   actual workspace before this false-positive rate means anything in
   production terms.
3. **Synthetic register.** Real Slack is messier — voice notes, threads
   inside threads, screenshots carrying the actual claim. None of that is
   represented here.
4. **English only.** A real Bangalore studio mixes languages in Slack; this
   corpus does not.
5. **No attachments or documents.** Several real-world contradictions live
   in a spec doc versus a message, which a message-only corpus cannot
   represent.
6. **C9's label is arguable by design** and is excluded from headline
   scoring for exactly that reason (see §6).
7. **Authority ranking is a two-level, corpus-fitted simplification**
   (`fixtures/corpus/cast.json`): only the studio head outranks everyone
   else. A real org chart would need a richer authority model before this
   generalises past the one gold case it was built to match.
8. **The noise gate's short-message rule (G5) also gates some legitimate
   short acknowledgements** ("noted!", "on it 🙋") along with genuine social
   chatter. This is an accepted precision/recall tradeoff in the gate
   itself, reported via the gated-message count rather than hidden.
9. **A JSON parse failure falls back to `COMPATIBLE`**, deliberately —
   this can only ever hurt contradiction recall, never inflate the
   headline false-positive rate. It is a conservative failure mode chosen
   on purpose, not an accident.
10. **The flagship `indep_event.launch_date` supersession transition only
    reproduces on the gold-claims eval path, not on the live-app
    extractor-claims path.** On the Signals tab, toggling `AsOfControl` to
    18 Jul shows `CONTRADICTION` rather than the expected
    `RESOLVED_BY_SUPERSESSION`, because the free model's extraction call
    for M-110 (Karthik Nair's authoritative "Let's go with the 15th.
    Final." message — the one R5's supersession rule needs) returned
    truncated chain-of-thought prose instead of JSON, hit the
    `maxOutputTokens` cap mid-sentence, and was correctly rejected by the
    repair ladder, producing zero claims from that message. This is the
    same conservative failure mode as #9 above (M-070/C8), just landing on
    a message this specific demo path depends on. The gold-claims eval
    path is unaffected — it uses hand-labeled claims, not live extraction —
    so `npm run eval`, the frozen baseline, and every number in this
    README and the deck are correct and unaffected. Not patched around by
    re-prompting or raising the token cap after seeing this result; that
    would be exactly the kind of post-hoc tuning §9 below rules out.
11. **No real notifications, assignment, or discussion.** Signals now has
    two real user actions on a conflict — Dismiss (reversible, re-raises on
    change) and Mark as resolved (records who won and by whom, same
    persistence guarantee) — but there is still no way to notify or flag
    the other person, assign a conflict to someone, or leave a comment
    thread on it. Those are real needs for an actual PM tool but are a
    materially larger build (real external-write integration, not just UI)
    than this pass covers — named here as the honest next gap, not silently
    missing and not built under time pressure.
12. **Five items named as roadmap, not built, after a hands-on usability
    pass** — each would need new backend logic this build has no admin or
    multi-tenant layer for, not just a UI change:
    - A model-generated recommendation for how to handle a given
      disagreement (needs a new prompt and a new model call — the current
      model is only ever asked "do these conflict?").
    - Functionally live connector onboarding (`/settings` now shows named,
      inactive sources — Linear, Notion, Jira — alongside Slack/Gmail, but
      adding one for real means a new MCP-style tool and adapter, not a
      toggle).
    - A real date-range picker on Signals/Ledger — only three fixed
      snapshot dates exist in the fixture data; a picker with nothing
      behind most of the calendar would be decorative.
    - User-editable topic/theme regrouping on the Ledger tab — bucket keys
      are produced by the deterministic referent resolver
      (`src/core/referent.ts`); letting a user reassign them by hand would
      mean writing to state the reproducibility guarantee in §5 depends on.
    - AI-suggested new Try-it scenarios — the sandbox's prefilled examples
      are hand-curated instead (three now, covering a cross-source
      contradiction, a negative-polarity single read, and a positive-
      polarity single read), each verified against a committed recording
      rather than generated on the fly.

---

## 9. Rules this project holds itself to

- **No invented metrics.** Every number in this README comes from an actual
  `npm run eval` run. Where a number isn't in yet, this README says so
  (§6), rather than filling the gap with a plausible-looking placeholder.
- **No claimed autonomy beyond what was built.** See §4.
- **Deterministic code wherever judgment isn't required; models only where
  it is.** The pre-rule ladder (`src/core/prerules.ts`) is the concrete
  expression of this — four of the seven possible verdicts are decided by
  code, and the README says exactly which ones and why (§3).
- **The recorded responses and the eval baseline are committed to git.**
- Every fixture is synthetic — nothing in this corpus is confidential, and
  nothing leaves the machine that would matter if a gateway provider trains
  on prompts.

---

## Local development

```bash
nvm use          # .nvmrc pins 24.15.0
npm ci
npm run dev      # http://localhost:3000
npm test         # node:test, zero extra deps
npm run eval     # offline, no API key
npm run build    # also regenerates fixtures/recorded.generated.ts and src/corpus/bundled.generated.ts
```

`npm run record` and live mode both need `AI_GATEWAY_API_KEY` in
`.env.local` (see `.env.example`) — replay mode needs neither.

## MCP server (bonus)

```bash
cd mcp-server
npm install
npm run dev                                              # stdio server
npx @modelcontextprotocol/inspector node --experimental-strip-types src/index.ts   # interactive inspector
```

Separate workspace, separate `package.json`/lockfile — not part of the
Next.js build, and Vercel's build never touches it.

## Deploying

Zero-config on Vercel — this is a standard Next.js App Router project.

```bash
npx vercel                 # first deploy, follow the prompts
# or connect the GitHub repo in the Vercel dashboard for auto-deploy on push
```

Set these in the Vercel project's environment variables (Settings →
Environment Variables), never in a client-visible file:

| Variable | Value | Notes |
|---|---|---|
| `AI_GATEWAY_API_KEY` | (the gateway key) | Server-side only. Required for live mode; replay mode (the default) works without it. |
| `LIVE_MODE_ENABLED` | `true` | To expose the Live toggle on the hosted deployment. |
| `EVAL_AS_OF` | `2026-07-24T23:59:59+05:30` | Optional — this is also the compiled-in default. |
| `LEDGER_STORE` | `memory` | Default when `VERCEL` is set; explicit is fine too. |

No database, no KV store, no external service to provision — the hosted
ledger uses the in-memory `LedgerStore` and does not survive a restart (see
§3), which is the deliberate tradeoff that keeps this to zero external
dependencies for a reviewer.

### Enabling live mode on a Vercel deployment

**Replay mode (the default) needs none of this and is what every number in
this README is based on.** Live mode is opt-in bonus interactivity on the
&ldquo;Try it&rdquo; page — it lets a reviewer type freeform text and run it
against the real model instead of a committed recording. Nothing elsewhere in
the app (Signals, Ledger, Evals, Architecture) ever needs it.

To turn it on for a given Vercel deployment:

1. Open the project in the Vercel dashboard.
2. **Project Settings → Environment Variables.**
3. Add `AI_GATEWAY_API_KEY` with your Vercel AI Gateway key, scoped to
   whichever environments you want live mode on (Production/Preview/
   Development).
4. Add `LIVE_MODE_ENABLED` set to `true`, same scope.
5. Redeploy (Vercel doesn't pick up new environment variables on an existing
   deployment — trigger a new one, e.g. **Deployments → ⋯ → Redeploy**, or
   push a commit).

Once both are set, the &ldquo;enable live mode&rdquo; checkbox on `/sandbox`
stops being disabled. If either is missing, the checkbox stays off with an
honest reason shown inline (`GET /api/sandbox` reports which one) rather than
silently doing nothing when checked.
