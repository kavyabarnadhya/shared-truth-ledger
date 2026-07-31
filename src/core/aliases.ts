/**
 * The referent catalogue: canonical keys from FIXTURE_SPEC.md §4, plus the
 * few additional keys GOLD_LABELS.md's must-not-flag scenarios need
 * (`soft_launch.date`, `indep_event.duration`, `config_freeze.owner`,
 * `reward_config.tiers`) and the uncontested single-claim referents (N12-N18).
 *
 * `forbidden` and `requiredAny` are the discrete gates that decide N3 and N4
 * — see referent.ts for how they're applied. They are deliberately
 * hand-authored and auditable rather than learned: a wrong resolution here
 * is fixed by editing one line, not by retuning a threshold.
 */

export interface ReferentDef {
  key: string;
  label: string;
  /** Normalised phrases that map exactly to this key (checked pre-normalised at lookup time). */
  aliases: string[];
  /** Discriminator tokens that MUST be present (any-of within at least one group) for this key to win. */
  requiredAny?: string[][];
  /** Tokens that DISQUALIFY this key outright if present in the claim's context window. */
  forbidden?: string[];
}

export const REFERENTS: ReferentDef[] = [
  {
    key: "indep_event.launch_date",
    label: "Independence Day event go-live date",
    aliases: [
      "independence day event go live",
      "independence event launch date",
      "indep event launch date",
      "event go live date",
      "global launch date",
      "launch date",
      "go live",
    ],
    forbidden: ["onam", "soft", "soft launch", "canada", "nz", "cohort", "level 40", "push notification"],
  },
  {
    key: "soft_launch.date",
    label: "Soft launch date (Canada/NZ cohort)",
    aliases: ["soft launch date", "soft launch", "geo launch date", "cohort launch date"],
    requiredAny: [["soft", "canada", "nz", "cohort", "geo"]],
    forbidden: ["onam"],
  },
  {
    key: "onam_event.launch_date",
    label: "Onam event go-live date",
    aliases: ["onam event go live", "onam event launch date", "onam launch date", "onam go live"],
    requiredAny: [["onam"]],
    forbidden: ["independence", "indep", "tiranga", "tricolour", "soft"],
  },
  {
    key: "indep_event.success_criteria",
    label: "Definition of success for the Independence Day event",
    aliases: ["success criterion", "success criteria", "definition of success", "what success looks like"],
  },
  {
    key: "indep_event.reward_config",
    label: "Reward table configuration for the Independence Day event",
    aliases: ["reward config", "reward table configuration", "reward table config"],
    forbidden: ["tier", "tiers", "live state", "shop", "player"],
  },
  {
    key: "liveops_calendar.signoff_owner",
    label: "Who holds final sign-off on the live ops calendar",
    aliases: ["signoff owner", "calendar signoff", "final signoff", "sign off owner", "live ops calendar signoff"],
  },
  {
    key: "level40_art.eta",
    label: "Delivery date for the Level 40 art pack",
    aliases: ["level 40 art pack eta", "level 40 art pack", "level 40 pack", "level 40 art eta"],
    requiredAny: [["level 40", "level40"]],
  },
  {
    key: "art_capacity.allocation",
    label: "Where the art team's capacity is committed",
    aliases: ["art capacity allocation", "art team capacity", "artist allocation", "art capacity"],
  },
  {
    key: "tournament.scope",
    label: "What ships in v1 of Tiranga tournament mode",
    aliases: ["tournament scope", "tiranga tournament scope", "tournament mode scope", "bracket system"],
  },
  {
    key: "leaderboard.readiness",
    label: "When the leaderboard backend is safe to ship",
    aliases: ["leaderboard readiness", "leaderboard migration readiness", "leaderboard backend readiness"],
    requiredAny: [["leaderboard"]],
  },
  {
    key: "build_194.release_readiness",
    label: "Whether build 1.9.4 can ship",
    aliases: ["build readiness", "release readiness", "1 9 4 readiness", "build 1 9 4 release readiness"],
    requiredAny: [["build", "1 9 4", "194", "release"]],
  },
  {
    key: "d7_retention.trend",
    label: "Direction of D7 retention",
    aliases: ["d7 retention trend", "d7 retention direction", "retention trend", "d7 trend"],
    requiredAny: [["d7", "retention"]],
  },
  {
    key: "reward_config.live_state",
    label: "Whether the new reward table is actually live",
    aliases: ["reward config live state", "reward table live state", "reward config live", "shop reward table"],
    requiredAny: [["live", "shop", "player"]],
  },
  {
    key: "reward_config.tiers",
    label: "Number of tiers in the reward table",
    aliases: ["reward table tier", "reward config tier", "tier count", "number of tier"],
    requiredAny: [["tier"]],
  },
  {
    key: "indep_event.duration",
    label: "How long the Independence Day event runs",
    aliases: ["event duration", "event run length", "event length"],
    requiredAny: [["duration", "run", "day from"]],
  },
  {
    key: "config_freeze.owner",
    label: "Who owns the config freeze",
    aliases: ["config freeze owner", "config freeze"],
    requiredAny: [["config freeze", "freeze"]],
  },
  // N12-N18 uncontested single-claim referents.
  {
    key: "push_notification.upgrade_eta",
    label: "Push notification service upgrade delivery date",
    aliases: ["push notification service upgrade", "push notification upgrade", "notification service upgrade"],
    requiredAny: [["push notification", "notification service"]],
  },
  {
    key: "event_dashboard.readiness",
    label: "When the event dashboard will be ready",
    aliases: ["event dashboard readiness", "event dashboard eta", "dashboard readiness"],
    requiredAny: [["dashboard"]],
  },
  {
    key: "ua_creative_refresh.booking",
    label: "August burst creative refresh booking status",
    aliases: ["creative refresh booking", "august burst creative", "creative refresh"],
    requiredAny: [["creative"]],
  },
  {
    key: "qa_regression_suite.coverage",
    label: "What the regression suite covers",
    aliases: ["regression suite coverage", "regression suite", "reconnect path coverage"],
    requiredAny: [["regression"]],
  },
  {
    key: "tricolour_token_set.status",
    label: "Status of the tricolour token set art",
    aliases: ["tricolour token set status", "tricolour token set", "token set polish"],
    requiredAny: [["tricolour", "token set"]],
  },
  {
    key: "event_faq.status",
    label: "Status of the event FAQ update",
    aliases: ["event faq status", "faq update", "event faq"],
    requiredAny: [["faq"]],
  },
  {
    key: "difficulty_curve.status",
    label: "Status of the levels 38-42 difficulty curve rebalance",
    aliases: ["difficulty curve status", "difficulty curve rebalance", "level difficulty curve"],
    requiredAny: [["difficulty curve", "difficulty"]],
  },
];

export interface AmbiguityGroup {
  id: string;
  members: string[];
  /** Surface tokens that trigger the ambiguity check (both referents' phrasing overlaps on these). */
  trigger: string[];
}

/**
 * `indep_event.launch_date` and `soft_launch.date` are the corpus's one
 * deliberate ambiguity trap (N3): both get called "launch date" with no
 * further context, and only a discriminator token in the surrounding text
 * (Canada/NZ/cohort vs nothing) tells them apart. See referent.ts's
 * `detectAmbiguityPairs` for how this group is used.
 */
export const AMBIGUITY_GROUPS: AmbiguityGroup[] = [
  {
    id: "launch_type",
    members: ["indep_event.launch_date", "soft_launch.date"],
    trigger: ["launch", "go live", "launch date"],
  },
];
