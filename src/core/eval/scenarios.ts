/**
 * The scenario registry: maps every scenario id (C1-C9, N1-N18) from
 * GOLD_LABELS.md §3 / FIXTURE_SPEC.md §9 to the messages it owns, the gold
 * claims it expects, and the bucket(s)/as-of/verdict it is scored on. This
 * is imported by both the CLI eval script and the browser Evals tab — it is
 * the single source of truth for "what does this corpus scenario mean",
 * so scoring can never quietly drift between the two entry points.
 */

import type { Instant, ScenarioId, VerdictKind } from "../types.ts";
import { parseInstant, EVAL_AS_OF_DEFAULT, AS_OF_15_JUL, AS_OF_18_JUL } from "../time.ts";

export interface ScenarioBucketExpectation {
  key: string;
  asOf: Instant;
  expected: VerdictKind;
  /** Set for N7/N8: the bucket must NOT list this claim id among its conflicting claims. */
  mustNotAppearInConflict?: string;
}

export interface ScenarioDef {
  id: ScenarioId;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  kind: "contradiction" | "must_not_flag" | "contested";
  /** Messages this scenario owns. The extraction grader scores ONLY these. */
  messageIds: string[];
  /** Gold claim ids expected from those messages. Empty = no claim should be emitted. */
  goldClaimIds: string[];
  /** Buckets this scenario's adjudication is scored on, each with its own as-of. */
  buckets: ScenarioBucketExpectation[];
  /** N11 only: message ids that must be gated pre-extraction. */
  expectGated?: string[];
  scoredInHeadline: boolean;
  notes: string;
}

const AT_10JUL_1120 = parseInstant("2026-07-10T11:20:00+05:30");
const AT_10JUL_1541 = parseInstant("2026-07-10T15:41:00+05:30");

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "C1", title: "Launch date, Slack vs Gmail", difficulty: "Easy", kind: "contradiction",
    messageIds: ["M-001", "M-002"], goldClaimIds: ["CL-001", "CL-002"],
    buckets: [{ key: "indep_event.launch_date", asOf: AS_OF_15_JUL, expected: "CONTRADICTION" }],
    scoredInHeadline: true,
    notes: "Cross-channel launch date conflict, 9 days apart. The flagship bucket's first act.",
  },
  {
    id: "C2", title: "Success criteria", difficulty: "Medium", kind: "contradiction",
    messageIds: ["M-010", "M-011"], goldClaimIds: ["CL-010", "CL-011"],
    buckets: [{ key: "indep_event.success_criteria", asOf: EVAL_AS_OF_DEFAULT, expected: "CONTRADICTION" }],
    scoredInHeadline: true,
    notes: "Semantic conflict, not a shared numeric value — PM wants ARPDAU, designer wants session depth.",
  },
  {
    id: "C3", title: "Sign-off ownership", difficulty: "Medium", kind: "contradiction",
    messageIds: ["M-020", "M-021"], goldClaimIds: ["CL-020", "CL-021"],
    buckets: [{ key: "liveops_calendar.signoff_owner", asOf: EVAL_AS_OF_DEFAULT, expected: "CONTRADICTION" }],
    scoredInHeadline: true,
    notes: "Both asserters claim ownership for themselves.",
  },
  {
    id: "C4", title: "D7 retention direction", difficulty: "Hard", kind: "contradiction",
    messageIds: ["M-030", "M-031"], goldClaimIds: ["CL-030", "CL-031"],
    buckets: [{ key: "d7_retention.trend", asOf: EVAL_AS_OF_DEFAULT, expected: "CONTRADICTION" }],
    scoredInHeadline: true,
    notes: "Same metric, different cuts (returning-player cohort vs paid installs). Gold calls this one referent; a system that splits by cohort would be defensible — see README limitations.",
  },
  {
    id: "C5", title: "Tournament scope", difficulty: "Hard", kind: "contradiction",
    messageIds: ["M-040", "M-041"], goldClaimIds: ["CL-040", "CL-041"],
    buckets: [{ key: "tournament.scope", asOf: EVAL_AS_OF_DEFAULT, expected: "CONTRADICTION" }],
    scoredInHeadline: true,
    notes: "Implicit contradiction requiring an inference step (bracket seeding work implies brackets were not cut).",
  },
  {
    id: "C6", title: "Leaderboard feasibility", difficulty: "Medium", kind: "contradiction",
    messageIds: ["M-050", "M-051"], goldClaimIds: ["CL-050", "CL-051"],
    buckets: [{ key: "leaderboard.readiness", asOf: EVAL_AS_OF_DEFAULT, expected: "CONTRADICTION" }],
    scoredInHeadline: true,
    notes: "Engineering feasibility date vs PM commitment date.",
  },
  {
    id: "C7", title: "Build 1.9.4 readiness", difficulty: "Easy", kind: "contradiction",
    messageIds: ["M-060", "M-061"], goldClaimIds: ["CL-060", "CL-061"],
    buckets: [{ key: "build_194.release_readiness", asOf: EVAL_AS_OF_DEFAULT, expected: "CONTRADICTION" }],
    scoredInHeadline: true,
    notes: "QA blocker vs producer's ship date — direct positive/negative readiness conflict.",
  },
  {
    id: "C8", title: "Art capacity", difficulty: "Medium", kind: "contradiction",
    messageIds: ["M-070", "M-071"], goldClaimIds: ["CL-070", "CL-071"],
    buckets: [{ key: "art_capacity.allocation", asOf: EVAL_AS_OF_DEFAULT, expected: "CONTRADICTION" }],
    scoredInHeadline: true,
    notes: "Same capacity claimed fully committed to two different events.",
  },
  {
    id: "C9", title: "Reward config live state", difficulty: "Hard", kind: "contested",
    messageIds: ["M-080", "M-081"], goldClaimIds: ["CL-080", "CL-081"],
    buckets: [{ key: "reward_config.live_state", asOf: EVAL_AS_OF_DEFAULT, expected: "CONTESTED" }],
    scoredInHeadline: false,
    notes: "Both may be true simultaneously (staged rollout / client cache). Reported separately, never folded into headline precision.",
  },
  {
    id: "N1", title: "Self-revision", difficulty: "Easy", kind: "must_not_flag",
    messageIds: ["M-100", "M-101"], goldClaimIds: ["CL-100", "CL-101"],
    buckets: [{ key: "level40_art.eta", asOf: EVAL_AS_OF_DEFAULT, expected: "UPDATE" }],
    scoredInHeadline: true,
    notes: "Same asserter revises their own earlier estimate.",
  },
  {
    id: "N2", title: "Studio head override", difficulty: "Medium", kind: "must_not_flag",
    messageIds: ["M-110"], goldClaimIds: ["CL-110"],
    buckets: [{ key: "indep_event.launch_date", asOf: AS_OF_18_JUL, expected: "RESOLVED_BY_SUPERSESSION" }],
    scoredInHeadline: true,
    notes: "The flagship bucket's second act — authoritative supersession settles C1's contradiction.",
  },
  {
    id: "N3", title: "Soft vs global launch", difficulty: "Hard", kind: "must_not_flag",
    messageIds: ["M-120", "M-121"], goldClaimIds: ["CL-120", "CL-121"],
    buckets: [{ key: "indep_event.launch_date|soft_launch.date", asOf: EVAL_AS_OF_DEFAULT, expected: "AMBIGUOUS_REFERENT" }],
    scoredInHeadline: true,
    notes: "Both correct — Arjun means soft launch (Canada/NZ), Priya means global. Must not collide into indep_event.launch_date.",
  },
  {
    id: "N4", title: "Onam vs Independence", difficulty: "Hard", kind: "must_not_flag",
    messageIds: ["M-130"], goldClaimIds: ["CL-130"],
    buckets: [{ key: "onam_event.launch_date", asOf: EVAL_AS_OF_DEFAULT, expected: "COMPATIBLE" }],
    scoredInHeadline: true,
    notes: "Near-miss referent: superficially similar to indep_event.launch_date but must resolve distinctly. Cosine similarity would get this wrong; discrete token gates get it right.",
  },
  {
    id: "N5", title: "Hedge", difficulty: "Medium", kind: "must_not_flag",
    messageIds: ["M-140"], goldClaimIds: [],
    buckets: [],
    scoredInHeadline: true,
    notes: "A proposal ('what if we pushed...') is not a claim. Zero claims expected.",
  },
  {
    id: "N6", title: "Question", difficulty: "Easy", kind: "must_not_flag",
    messageIds: ["M-150"], goldClaimIds: [],
    buckets: [],
    scoredInHeadline: true,
    notes: "A question is not a claim. Zero claims expected.",
  },
  {
    id: "N7", title: "Reported speech", difficulty: "Hard", kind: "must_not_flag",
    messageIds: ["M-160"], goldClaimIds: ["CL-160"],
    buckets: [{
      key: "indep_event.launch_date", asOf: EVAL_AS_OF_DEFAULT, expected: "RESOLVED_BY_SUPERSESSION",
      mustNotAppearInConflict: "CL-160",
    }],
    scoredInHeadline: true,
    notes: "Sana is relaying Priya's statement, not asserting it herself. Treating her as asserter would manufacture a false contradiction against CL-001.",
  },
  {
    id: "N8", title: "Negation", difficulty: "Hard", kind: "must_not_flag",
    messageIds: ["M-170"], goldClaimIds: ["CL-170"],
    buckets: [{
      key: "indep_event.launch_date", asOf: EVAL_AS_OF_DEFAULT, expected: "RESOLVED_BY_SUPERSESSION",
      mustNotAppearInConflict: "CL-170",
    }],
    scoredInHeadline: true,
    notes: "Negative polarity: 'we are not going with the 15th' must not be read as asserting the 15th. Reading it that way inverts the entire ledger.",
  },
  {
    id: "N9", title: "Compatible claims", difficulty: "Easy", kind: "must_not_flag",
    messageIds: ["M-180"], goldClaimIds: ["CL-180a", "CL-180b"],
    buckets: [
      { key: "indep_event.duration", asOf: EVAL_AS_OF_DEFAULT, expected: "COMPATIBLE" },
      { key: "config_freeze.owner", asOf: EVAL_AS_OF_DEFAULT, expected: "COMPATIBLE" },
    ],
    scoredInHeadline: true,
    notes: "One message, two distinct uncontested claims about different referents.",
  },
  {
    id: "N10", title: "Raised then reconciled", difficulty: "Medium", kind: "must_not_flag",
    messageIds: ["M-190", "M-191", "M-192"], goldClaimIds: ["CL-190", "CL-191", "CL-192"],
    buckets: [
      { key: "reward_config.tiers", asOf: AT_10JUL_1120, expected: "CONTRADICTION" },
      { key: "reward_config.tiers", asOf: AT_10JUL_1541, expected: "RESOLVED_BY_CORRECTION" },
    ],
    scoredInHeadline: true,
    notes: "Scored at two points in time like the flagship bucket, on a smaller scale: live disagreement, then self-correction.",
  },
  {
    id: "N11", title: "Bot and social noise", difficulty: "Easy", kind: "must_not_flag",
    messageIds: ["M-200", "M-201", "M-202", "M-203"], goldClaimIds: [],
    buckets: [], expectGated: ["M-200", "M-201", "M-202", "M-203"],
    scoredInHeadline: true,
    notes: "Gated pre-extraction, never reach the extractor at all.",
  },
  ...(["N12", "N13", "N14", "N15", "N16", "N17", "N18"] as const).map((id, i): ScenarioDef => {
    const messageId = `M-${210 + i}`;
    const claimId = `CL-${210 + i}`;
    const referents = [
      "push_notification.upgrade_eta",
      "event_dashboard.readiness",
      "ua_creative_refresh.booking",
      "qa_regression_suite.coverage",
      "tricolour_token_set.status",
      "event_faq.status",
      "difficulty_curve.status",
    ];
    return {
      id,
      title: `Uncontested claim (${messageId})`,
      difficulty: "Easy",
      kind: "must_not_flag",
      messageIds: [messageId],
      goldClaimIds: [claimId],
      buckets: [{ key: referents[i]!, asOf: EVAL_AS_OF_DEFAULT, expected: "COMPATIBLE" }],
      scoredInHeadline: true,
      notes: "Base-rate padding: one assertion, no counterpart anywhere in the corpus.",
    };
  }),
];

export const SCENARIOS_BY_ID: ReadonlyMap<ScenarioId, ScenarioDef> = new Map(
  SCENARIOS.map((s) => [s.id, s]),
);

/** Referents that are always CONTESTED regardless of model output (R8). Currently just C9's. */
export const CONTESTED_REFERENTS: ReadonlySet<string> = new Set(["reward_config.live_state"]);

/** N1-N18 counted individually, C9 excluded — fixed before the first run, per the eval protocol. */
export const MUST_NOT_FLAG_TOTAL = SCENARIOS.filter((s) => s.kind === "must_not_flag").length;

/** The 8 scored contradiction scenarios (C1-C8; C9 excluded). */
export const CONTRADICTION_SCENARIOS = SCENARIOS.filter((s) => s.kind === "contradiction");
