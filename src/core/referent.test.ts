import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveReferent, extractContextWindow, detectAmbiguityPairs, mergeFreshReferents } from "./referent.ts";
import type { AmbiguityCandidateClaim } from "./referent.ts";
import { parseInstant } from "./time.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const messages = JSON.parse(readFileSync(join(ROOT, "fixtures/corpus/messages.json"), "utf8"))
  .messages as Array<{ id: string; text: string }>;
const byId = new Map(messages.map((m) => [m.id, m]));

function resolve(rawReferent: string, messageId: string, sourceSpan: string) {
  const message = byId.get(messageId);
  if (!message) throw new Error(`fixture message ${messageId} not found`);
  return resolveReferent(rawReferent, { messageText: message.text, sourceSpan });
}

// ---------------------------------------------------------------------------
// N4 — Onam vs Independence near-miss. Must resolve to a DIFFERENT referent,
// not collide with indep_event.launch_date.
// ---------------------------------------------------------------------------

test("N4: 'Onam event go-live date' resolves to onam_event.launch_date via exact match, no embedding needed", () => {
  const r = resolve("onam event go live date", "M-130", "Onam event target go-live is 26 August");
  assert.equal(r.resolved, "onam_event.launch_date");
  // Normalisation folds "go live" into "launch date", so this raw phrase
  // ends up matching the canonical key itself (exact_key) rather than one
  // of the hand-written alias strings (alias) — both are confident,
  // zero-embedding resolutions, so either method is a correct outcome. What
  // matters for N4 is that it resolves to onam_event.launch_date without
  // ever consulting an embedding.
  assert.ok(r.method === "exact_key" || r.method === "alias", `unexpected method: ${r.method}`);
  assert.equal(r.embeddingUsed, false);
});

test("N4: a looser 'onam go live' phrasing still resolves to onam_event.launch_date, never indep_event", () => {
  const r = resolve("onam go live", "M-130", "Onam event target go-live is 26 August");
  assert.equal(r.resolved, "onam_event.launch_date");
  assert.notEqual(r.resolved, "indep_event.launch_date");
});

test("N4: even a generic 'launch date' phrasing in the Onam message context does not collide with Independence", () => {
  // Worst case: extractor emits a generic raw_referent with no "onam" token
  // in the phrase itself. The window (message text) still contains "Onam",
  // so indep_event.launch_date is zeroed by its forbidden list.
  const r = resolve("launch date", "M-130", "target go-live is 26 August");
  assert.notEqual(r.resolved, "indep_event.launch_date");
});

test("N4: indep_event.launch_date is forbidden when the context window mentions onam", () => {
  const r = resolve("event go live date", "M-130", "Onam event target go-live is 26 August");
  assert.notEqual(r.resolved, "indep_event.launch_date");
});

// ---------------------------------------------------------------------------
// N3 — soft launch (Canada/NZ) vs global launch. Same surface phrase
// "launch date", disambiguated only by context tokens.
// ---------------------------------------------------------------------------

test("N3: M-120's 'launch is the 5th' resolves to soft_launch.date because the window mentions Canada/NZ/cohort", () => {
  const r = resolve(
    "launch date",
    "M-120",
    "Launch is the 5th for us",
  );
  assert.equal(r.resolved, "soft_launch.date");
});

test("N3: M-121's 'launch is the 15th' resolves to indep_event.launch_date because the window has no soft-launch discriminator", () => {
  const r = resolve("launch date", "M-121", "Launch is the 15th");
  assert.equal(r.resolved, "indep_event.launch_date");
});

test("N3: detectAmbiguityPairs flags the cross-referent pair when both resolve within the same ambiguity group", () => {
  const claims: AmbiguityCandidateClaim[] = [
    {
      claim_id: "CL-120",
      referent: "soft_launch.date",
      raw_referent: "launch date",
      value: "2026-08-05",
      timestamp: parseInstant("2026-07-13T10:20:00+05:30"),
      thread_id: "T1",
      channel: "#liveops-ludojunction",
    },
    {
      claim_id: "CL-121",
      referent: "indep_event.launch_date",
      raw_referent: "launch date",
      value: "2026-08-15",
      timestamp: parseInstant("2026-07-13T10:44:00+05:30"),
      thread_id: "T1",
      channel: "#liveops-ludojunction",
    },
  ];
  const byReferent = new Map<string, AmbiguityCandidateClaim[]>();
  for (const c of claims) {
    const arr = byReferent.get(c.referent) ?? [];
    arr.push(c);
    byReferent.set(c.referent, arr);
  }
  const pairs = detectAmbiguityPairs(byReferent);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]!.bucketKey, "indep_event.launch_date|soft_launch.date");
});

test("N3: detectAmbiguityPairs does NOT flag claims outside the 24h window", () => {
  const claims: AmbiguityCandidateClaim[] = [
    {
      claim_id: "CL-A",
      referent: "soft_launch.date",
      raw_referent: "launch date",
      value: "2026-08-05",
      timestamp: parseInstant("2026-07-01T10:20:00+05:30"),
      thread_id: "T1",
    },
    {
      claim_id: "CL-B",
      referent: "indep_event.launch_date",
      raw_referent: "launch date",
      value: "2026-08-15",
      timestamp: parseInstant("2026-07-13T10:44:00+05:30"),
      thread_id: "T1",
    },
  ];
  const byReferent = new Map<string, AmbiguityCandidateClaim[]>();
  for (const c of claims) {
    const arr = byReferent.get(c.referent) ?? [];
    arr.push(c);
    byReferent.set(c.referent, arr);
  }
  assert.equal(detectAmbiguityPairs(byReferent).length, 0);
});

test("N3: detectAmbiguityPairs does NOT flag claims with the same value (no conflict to surface)", () => {
  const claims: AmbiguityCandidateClaim[] = [
    {
      claim_id: "CL-A",
      referent: "soft_launch.date",
      raw_referent: "launch date",
      value: "2026-08-15",
      timestamp: parseInstant("2026-07-13T10:20:00+05:30"),
      thread_id: "T1",
    },
    {
      claim_id: "CL-B",
      referent: "indep_event.launch_date",
      raw_referent: "launch date",
      value: "2026-08-15",
      timestamp: parseInstant("2026-07-13T10:44:00+05:30"),
      thread_id: "T1",
    },
  ];
  const byReferent = new Map<string, AmbiguityCandidateClaim[]>();
  for (const c of claims) {
    const arr = byReferent.get(c.referent) ?? [];
    arr.push(c);
    byReferent.set(c.referent, arr);
  }
  assert.equal(detectAmbiguityPairs(byReferent).length, 0);
});

// ---------------------------------------------------------------------------
// extractContextWindow
// ---------------------------------------------------------------------------

test("extractContextWindow captures tokens beyond the span itself", () => {
  const text = "Launch is the 5th for us — that's when the Canada and NZ cohort gets it.";
  const w = extractContextWindow(text, "Launch is the 5th");
  assert.ok(w.includes("Canada"));
  assert.ok(w.includes("NZ"));
});

test("extractContextWindow falls back to full text if the span cannot be located", () => {
  const text = "some message text";
  const w = extractContextWindow(text, "not present anywhere");
  assert.equal(w, text);
});

// ---------------------------------------------------------------------------
// Every gold claim's referent resolves correctly (GOLD_LABELS.md §2), driven
// off hand-written raw_referent guesses an extractor would plausibly emit.
// ---------------------------------------------------------------------------

const GOLD_REFERENT_CASES: Array<{
  label: string;
  rawReferent: string;
  messageId: string;
  sourceSpan: string;
  expected: string;
}> = [
  { label: "CL-001", rawReferent: "go live date", messageId: "M-001", sourceSpan: "we go live 12 August", expected: "indep_event.launch_date" },
  { label: "CL-002", rawReferent: "go live date", messageId: "M-002", sourceSpan: "Go-live is 15 August", expected: "indep_event.launch_date" },
  { label: "CL-010", rawReferent: "success criteria", messageId: "M-010", sourceSpan: "Success on this one is ARPDAU lift across the seven-day window", expected: "indep_event.success_criteria" },
  { label: "CL-011", rawReferent: "definition of success", messageId: "M-011", sourceSpan: "Success for this event should be session depth and returning players, not ARPDAU", expected: "indep_event.success_criteria" },
  { label: "CL-020", rawReferent: "sign-off owner", messageId: "M-020", sourceSpan: "As producer I'll hold final sign-off on the live ops calendar", expected: "liveops_calendar.signoff_owner" },
  { label: "CL-021", rawReferent: "calendar signoff", messageId: "M-021", sourceSpan: "Calendar sign-off sits with me", expected: "liveops_calendar.signoff_owner" },
  { label: "CL-030", rawReferent: "d7 retention trend", messageId: "M-030", sourceSpan: "D7 retention is up 1.8pp week on week", expected: "d7_retention.trend" },
  { label: "CL-031", rawReferent: "seven-day retention", messageId: "M-031", sourceSpan: "seven-day retention off 3pp since the 1.9.3 patch", expected: "d7_retention.trend" },
  { label: "CL-040", rawReferent: "tournament scope", messageId: "M-040", sourceSpan: "we cut the bracket system for v1", expected: "tournament.scope" },
  { label: "CL-041", rawReferent: "tournament scope", messageId: "M-041", sourceSpan: "bracket seeding rules for the Tiranga tournament", expected: "tournament.scope" },
  { label: "CL-050", rawReferent: "leaderboard readiness", messageId: "M-050", sourceSpan: "earliest date I'd call safe is 25 August", expected: "leaderboard.readiness" },
  { label: "CL-060", rawReferent: "build release readiness", messageId: "M-060", sourceSpan: "This is not release-ready", expected: "build_194.release_readiness" },
  { label: "CL-061", rawReferent: "build readiness", messageId: "M-061", sourceSpan: "We're shipping 1.9.4 on Friday", expected: "build_194.release_readiness" },
  { label: "CL-070", rawReferent: "art capacity allocation", messageId: "M-070", sourceSpan: "moving two artists onto the Onam board set", expected: "art_capacity.allocation" },
  { label: "CL-071", rawReferent: "art capacity", messageId: "M-071", sourceSpan: "Art is fully committed to the Independence assets through the 5th", expected: "art_capacity.allocation" },
  { label: "CL-080", rawReferent: "reward config live state", messageId: "M-080", sourceSpan: "players are still seeing the old Holi reward table", expected: "reward_config.live_state" },
  { label: "CL-081", rawReferent: "reward config live", messageId: "M-081", sourceSpan: "The reward config was updated on the 18th", expected: "reward_config.live_state" },
  { label: "CL-100", rawReferent: "level 40 art pack eta", messageId: "M-100", sourceSpan: "Level 40 art pack, first pass lands 24 July", expected: "level40_art.eta" },
  { label: "CL-101", rawReferent: "level 40 pack", messageId: "M-101", sourceSpan: "Level 40 pack will be 29 July", expected: "level40_art.eta" },
  { label: "CL-110", rawReferent: "go live date", messageId: "M-110", sourceSpan: "Let's go with the 15th", expected: "indep_event.launch_date" },
  { label: "CL-160", rawReferent: "go live date", messageId: "M-160", sourceSpan: "Priya said it's the 15th now", expected: "indep_event.launch_date" },
  { label: "CL-170", rawReferent: "go live date", messageId: "M-170", sourceSpan: "we are not going with the 15th", expected: "indep_event.launch_date" },
  { label: "CL-190", rawReferent: "reward table tiers", messageId: "M-190", sourceSpan: "Reward table has 12 tiers in the design doc", expected: "reward_config.tiers" },
  { label: "CL-191", rawReferent: "reward config tiers", messageId: "M-191", sourceSpan: "Config only has 8 tiers built", expected: "reward_config.tiers" },
  { label: "CL-192", rawReferent: "tier count", messageId: "M-192", sourceSpan: "8 tiers is correct", expected: "reward_config.tiers" },
  { label: "CL-210", rawReferent: "push notification upgrade", messageId: "M-210", sourceSpan: "Push notification service upgrade lands 30 July", expected: "push_notification.upgrade_eta" },
  { label: "CL-211", rawReferent: "event dashboard readiness", messageId: "M-211", sourceSpan: "Event dashboard will be ready by the 8th", expected: "event_dashboard.readiness" },
  { label: "CL-212", rawReferent: "creative refresh booking", messageId: "M-212", sourceSpan: "Creative refresh for the August burst is booked with the agency", expected: "ua_creative_refresh.booking" },
  { label: "CL-213", rawReferent: "regression suite coverage", messageId: "M-213", sourceSpan: "Regression suite now covers the reconnect path", expected: "qa_regression_suite.coverage" },
  { label: "CL-214", rawReferent: "tricolour token set status", messageId: "M-214", sourceSpan: "Tricolour token set is at final polish", expected: "tricolour_token_set.status" },
  { label: "CL-215", rawReferent: "event FAQ status", messageId: "M-215", sourceSpan: "FAQ update for the event is drafted", expected: "event_faq.status" },
  { label: "CL-216", rawReferent: "difficulty curve status", messageId: "M-216", sourceSpan: "Difficulty curve for levels 38", expected: "difficulty_curve.status" },
];

for (const c of GOLD_REFERENT_CASES) {
  test(`gold referent ${c.label}: "${c.rawReferent}" in ${c.messageId} resolves to ${c.expected}`, () => {
    const r = resolve(c.rawReferent, c.messageId, c.sourceSpan);
    assert.equal(r.resolved, c.expected, `notes: ${r.notes.join(" | ")}`);
  });
}

test("resolveReferent mints a new key for a phrase with no matching referent", () => {
  const r = resolve("weather forecast for the office picnic", "M-001", "we go live 12 August");
  assert.equal(r.method, "new_referent");
  assert.equal(r.band, "below_threshold");
});

test("resolveReferent is deterministic: same input, same output across repeated calls", () => {
  const a = resolve("go live date", "M-001", "we go live 12 August");
  const b = resolve("go live date", "M-001", "we go live 12 August");
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// mergeFreshReferents — repro from the live Try-it sandbox bug: two people
// disagreeing about "12th August" in freeform, non-catalogue phrasing minted
// three unrelated referents instead of landing in one bucket.
// ---------------------------------------------------------------------------

test("mergeFreshReferents merges two freeform mints that both name the same date, same thread", () => {
  const claims: AmbiguityCandidateClaim[] = [
    {
      claim_id: "CL-1",
      referent: "12th_august_launch_readiness",
      raw_referent: "12th August launch readiness",
      value: "not ready",
      timestamp: parseInstant("2026-07-22T17:40:00+05:30"),
      thread_id: "T-sandbox",
      channel: "#liveops-ludojunction",
    },
    {
      claim_id: "CL-2",
      referent: "launch_by_12th_august",
      raw_referent: "Launch by 12th August",
      value: "needed at any cost",
      timestamp: parseInstant("2026-07-24T12:00:00+05:30"),
      thread_id: "T-sandbox",
      channel: "#liveops-ludojunction",
    },
  ];
  const remap = mergeFreshReferents(claims);
  assert.equal(remap.get("12th_august_launch_readiness"), remap.get("launch_by_12th_august"));
  // Canonical key is the earlier claim's (CL-1, 22 Jul) own minted key.
  assert.equal(remap.get("launch_by_12th_august"), "12th_august_launch_readiness");
  assert.equal(remap.get("12th_august_launch_readiness"), "12th_august_launch_readiness");
});

test("mergeFreshReferents does NOT merge a same-thread mint about a different date", () => {
  const claims: AmbiguityCandidateClaim[] = [
    {
      claim_id: "CL-1",
      referent: "12th_august_launch_readiness",
      raw_referent: "12th August launch readiness",
      value: "not ready",
      timestamp: parseInstant("2026-07-22T17:40:00+05:30"),
      thread_id: "T-sandbox",
      channel: "#liveops-ludojunction",
    },
    {
      claim_id: "CL-3",
      referent: "14th_readiness_for_qa",
      raw_referent: "14th readiness for QA",
      value: "ready by 14th",
      timestamp: parseInstant("2026-07-22T17:40:00+05:30"),
      thread_id: "T-sandbox",
      channel: "#liveops-ludojunction",
    },
  ];
  const remap = mergeFreshReferents(claims);
  assert.notEqual(remap.get("12th_august_launch_readiness"), remap.get("14th_readiness_for_qa"));
});

test("mergeFreshReferents does NOT merge mints from different threads/channels even with matching dates", () => {
  const claims: AmbiguityCandidateClaim[] = [
    {
      claim_id: "CL-1",
      referent: "12th_august_launch_readiness",
      raw_referent: "12th August launch readiness",
      value: "not ready",
      timestamp: parseInstant("2026-07-22T17:40:00+05:30"),
      thread_id: "T-a",
      channel: "#liveops-ludojunction",
    },
    {
      claim_id: "CL-2",
      referent: "launch_by_12th_august",
      raw_referent: "Launch by 12th August",
      value: "needed at any cost",
      timestamp: parseInstant("2026-07-24T12:00:00+05:30"),
      thread_id: "T-b",
      channel: "#some-other-channel",
    },
  ];
  const remap = mergeFreshReferents(claims);
  assert.notEqual(remap.get("12th_august_launch_readiness"), remap.get("launch_by_12th_august"));
});

test("mergeFreshReferents leaves unrelated single mints unchanged", () => {
  const claims: AmbiguityCandidateClaim[] = [
    {
      claim_id: "CL-1",
      referent: "weather_forecast_for_the_office_picnic",
      raw_referent: "weather forecast for the office picnic",
      value: "sunny",
      timestamp: parseInstant("2026-07-22T17:40:00+05:30"),
      thread_id: "T-1",
    },
  ];
  const remap = mergeFreshReferents(claims);
  assert.equal(remap.get("weather_forecast_for_the_office_picnic"), "weather_forecast_for_the_office_picnic");
});

test("mergeFreshReferents merges via the lexical-fallback path when neither phrase has a parseable date", () => {
  const claims: AmbiguityCandidateClaim[] = [
    {
      claim_id: "CL-1",
      referent: "success_criteria_definition",
      raw_referent: "success criteria definition",
      value: "session depth",
      timestamp: parseInstant("2026-07-14T10:00:00+05:30"),
      thread_id: "T-1",
    },
    {
      claim_id: "CL-2",
      referent: "definition_of_success_criteria",
      raw_referent: "definition of success criteria",
      value: "ARPDAU",
      timestamp: parseInstant("2026-07-14T18:00:00+05:30"),
      thread_id: "T-1",
    },
  ];
  const remap = mergeFreshReferents(claims);
  assert.equal(remap.get("success_criteria_definition"), remap.get("definition_of_success_criteria"));
});

test("mergeFreshReferents does NOT merge via the lexical-fallback path when phrasing is dissimilar", () => {
  const claims: AmbiguityCandidateClaim[] = [
    {
      claim_id: "CL-1",
      referent: "tournament_scope_decision",
      raw_referent: "tournament scope decision",
      value: "in scope",
      timestamp: parseInstant("2026-07-14T10:00:00+05:30"),
      thread_id: "T-1",
    },
    {
      claim_id: "CL-2",
      referent: "art_capacity_allocation",
      raw_referent: "art capacity allocation",
      value: "two artists",
      timestamp: parseInstant("2026-07-14T18:00:00+05:30"),
      thread_id: "T-1",
    },
  ];
  const remap = mergeFreshReferents(claims);
  assert.notEqual(remap.get("tournament_scope_decision"), remap.get("art_capacity_allocation"));
});

test("mergeFreshReferents does NOT merge on date coincidence alone when the rest of the phrasing is essentially unrelated", () => {
  // Both phrases parse to the same date (12 August) but share almost no
  // other vocabulary — the DATE_MATCH_MIN_SIMILARITY floor should veto this
  // even though the date-match branch normally skips the 24h window check.
  const claims: AmbiguityCandidateClaim[] = [
    {
      claim_id: "CL-1",
      referent: "quarterly_roadmap_review",
      raw_referent:
        "quarterly roadmap review scheduled for 12 August covering platform migration headcount planning budget approvals vendor contracts",
      value: "scheduled",
      timestamp: parseInstant("2026-07-14T10:00:00+05:30"),
      thread_id: "T-1",
      channel: "#general",
    },
    {
      claim_id: "CL-2",
      referent: "payment_gateway_certificate_expiry",
      raw_referent:
        "12 August is when the new payment gateway certificate expires needs rotation security audit compliance",
      value: "expires",
      timestamp: parseInstant("2026-07-20T10:00:00+05:30"),
      thread_id: "T-1",
      channel: "#general",
    },
  ];
  const remap = mergeFreshReferents(claims);
  assert.notEqual(remap.get("quarterly_roadmap_review"), remap.get("payment_gateway_certificate_expiry"));
});
