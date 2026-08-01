import { test } from "node:test";
import assert from "node:assert/strict";
import { referentLabel, conflictTitle, sourceMeta, isCataloguedReferent, claimStateLabel } from "./display.ts";
import type { Claim } from "../core/types.ts";

function claim(overrides: Partial<Claim>): Claim {
  return {
    claim_id: "M-001#0",
    message_id: "M-001",
    referent: "some.key",
    raw_referent: "",
    predicate: "value",
    value: "x",
    raw_value: "x",
    asserter: "meera.iyer",
    modality: "assertion",
    polarity: "positive",
    attributed_to: null,
    timestamp: "2026-07-06T10:12:00+05:30" as Claim["timestamp"],
    source_span: "x",
    span_valid: true,
    span_offset: 0,
    ...overrides,
  };
}

test("referentLabel: uses REFERENTS.label when the key is catalogued", () => {
  assert.equal(referentLabel("indep_event.launch_date"), "Independence Day event go-live date");
});

test("referentLabel: falls back to raw_referent when the key is not catalogued", () => {
  const claims = [claim({ referent: "mystery.key", raw_referent: "the reward tier count thing" })];
  assert.equal(referentLabel("mystery.key", claims), "The reward tier count thing");
});

test("referentLabel: falls back to a prettified key when no claims/raw_referent are available", () => {
  assert.equal(referentLabel("mystery_topic.some_field"), "Mystery Topic Some Field");
});

test("referentLabel: prettifies each side of a cross-referent ambiguity bucket key", () => {
  assert.equal(
    referentLabel("indep_event.launch_date|soft_launch.date"),
    "Independence Day event go-live date vs Soft launch date (Canada/NZ cohort)",
  );
});

test("referentLabel: ignores claims with an empty raw_referent and falls back to the key", () => {
  const claims = [claim({ referent: "mystery.key", raw_referent: "" })];
  assert.equal(referentLabel("mystery.key", claims), "Mystery Key");
});

test("conflictTitle: lowercases the first word unless it looks like an acronym", () => {
  const bucket = { referent: "indep_event.launch_date", claims: [] };
  const title = conflictTitle(bucket);
  assert.ok(title.startsWith("Your team disagrees on independence Day event go-live date"));
});

test("conflictTitle: keeps acronym-like labels intact (D7 retention)", () => {
  const bucket = { referent: "d7_retention.trend", claims: [] };
  const title = conflictTitle(bucket);
  assert.ok(title.includes("D7 retention"));
});

test("conflictTitle: ambiguity bucket gets a distinct 'two different topics' framing", () => {
  const bucket = { referent: "indep_event.launch_date|soft_launch.date", claims: [] };
  const title = conflictTitle(bucket);
  assert.ok(title.startsWith("Your team is using two different topics"));
});

test("sourceMeta: Slack message uses channel as location", () => {
  const meta = sourceMeta({ source: "slack", channel: "#liveops-ludojunction", subject: undefined });
  assert.deepEqual(meta, { kind: "Slack", location: "#liveops-ludojunction" });
});

test("sourceMeta: Gmail message uses subject as location", () => {
  const meta = sourceMeta({ source: "gmail", channel: undefined, subject: "Release sign-off" });
  assert.deepEqual(meta, { kind: "Gmail", location: "Release sign-off" });
});

test("isCataloguedReferent: true for a REFERENTS key, false for extractor-minted noise", () => {
  assert.equal(isCataloguedReferent("indep_event.launch_date"), true);
  assert.equal(isCataloguedReferent("change_side"), false);
});

test("isCataloguedReferent: cross-referent bucket is catalogued only if both sides are", () => {
  assert.equal(isCataloguedReferent("indep_event.launch_date|soft_launch.date"), true);
  assert.equal(isCataloguedReferent("indep_event.launch_date|made_up_noise"), false);
});

test("claimStateLabel: plain labels for every ClaimState", () => {
  assert.equal(claimStateLabel("live"), "Current position");
  assert.equal(claimStateLabel("superseded"), "Changed their mind — replaced by a later message");
  assert.equal(claimStateLabel("excluded_reported"), "Relaying someone else, not their own claim");
  assert.equal(claimStateLabel("withdrawn"), "Withdrawn");
  assert.equal(claimStateLabel("not_yet_asserted"), "Not yet said, at this point in time");
});
