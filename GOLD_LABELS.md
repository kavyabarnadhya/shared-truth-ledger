# Gold Labels
**Ludo Junction corpus — ground truth for the two graders**

Two independent label sets. The **extraction grader** scores §2 only. The
**adjudication grader** is fed gold claims from §2 and scores §3 only. Never merge them.

---

## 1. Claim schema

```json
{
  "claim_id": "CL-001",
  "message_id": "M-001",
  "referent": "indep_event.launch_date",
  "predicate": "value",
  "value": "2026-08-12",
  "asserter": "meera.iyer",
  "modality": "assertion",
  "polarity": "positive",
  "attributed_to": null,
  "timestamp": "2026-07-06T10:12:00+05:30",
  "source_span": "we go live 12 August"
}
```

- `modality` — `assertion` | `hedge` | `proposal` | `question` | `reported`
- `polarity` — `positive` | `negative`
- `attributed_to` — set only when `modality = reported`; the original asserter
- `source_span` — must appear verbatim in `message.text` (validated in code)

---

## 2. Gold claims

### Contradiction scenarios

| Claim | Msg | Referent | Value | Asserter | Modality | Pol | Span |
|---|---|---|---|---|---|---|---|
| CL-001 | M-001 | `indep_event.launch_date` | 2026-08-12 | meera.iyer | assertion | + | we go live 12 August |
| CL-002 | M-002 | `indep_event.launch_date` | 2026-08-15 | priya.raghunathan | assertion | + | Go-live is 15 August |
| CL-010 | M-010 | `indep_event.success_criteria` | ARPDAU lift over 7-day window | meera.iyer | assertion | + | Success on this one is ARPDAU lift across the seven-day window |
| CL-011 | M-011 | `indep_event.success_criteria` | session depth and returning players | rohan.desai | assertion | + | Success for this event should be session depth and returning players, not ARPDAU |
| CL-020 | M-020 | `liveops_calendar.signoff_owner` | priya.raghunathan | priya.raghunathan | assertion | + | As producer I'll hold final sign-off on the live ops calendar |
| CL-021 | M-021 | `liveops_calendar.signoff_owner` | meera.iyer | meera.iyer | assertion | + | Calendar sign-off sits with me |
| CL-030 | M-030 | `d7_retention.trend` | up 1.8pp WoW | neha.bhatt | assertion | + | D7 retention is up 1.8pp week on week |
| CL-031 | M-031 | `d7_retention.trend` | down 3pp since 1.9.3 | arjun.rao | assertion | + | seven-day retention off 3pp since the 1.9.3 patch |
| CL-040 | M-040 | `tournament.scope` | leaderboard only, brackets cut | meera.iyer | assertion | + | we cut the bracket system for v1 |
| CL-041 | M-041 | `tournament.scope` | includes bracket seeding | rohan.desai | assertion | + | bracket seeding rules for the Tiranga tournament |
| CL-050 | M-050 | `leaderboard.readiness` | 2026-08-25 earliest | vikram.shetty | assertion | + | earliest date I'd call safe is 25 August |
| CL-051 | M-051 | `leaderboard.readiness` | ships with event | meera.iyer | assertion | + | Tiranga tournament mode shipping with the event |
| CL-060 | M-060 | `build_194.release_readiness` | not ready, open P1 | farah.qureshi | assertion | + | This is not release-ready |
| CL-061 | M-061 | `build_194.release_readiness` | shipping Friday | priya.raghunathan | assertion | + | We're shipping 1.9.4 on Friday |
| CL-070 | M-070 | `art_capacity.allocation` | 2 artists to Onam | sana.kulkarni | assertion | + | moving two artists onto the Onam board set |
| CL-071 | M-071 | `art_capacity.allocation` | fully on Independence assets | priya.raghunathan | assertion | + | Art is fully committed to the Independence assets through the 5th |
| CL-080 | M-080 | `reward_config.live_state` | old Holi table visible | deepak.menon | assertion | + | players are still seeing the old Holi reward table |
| CL-081 | M-081 | `reward_config.live_state` | new config live since 18th | meera.iyer | assertion | + | The reward config was updated on the 18th. It's live. |

### Must-not-flag scenarios

| Claim | Msg | Referent | Value | Asserter | Modality | Pol | Notes |
|---|---|---|---|---|---|---|---|
| CL-100 | M-100 | `level40_art.eta` | 2026-07-24 | sana.kulkarni | assertion | + | |
| CL-101 | M-101 | `level40_art.eta` | 2026-07-29 | sana.kulkarni | assertion | + | supersedes CL-100, same asserter |
| CL-110 | M-110 | `indep_event.launch_date` | 2026-08-15 | karthik.nair | assertion | + | authoritative |
| CL-120 | M-120 | `soft_launch.date` | 2026-08-05 | arjun.rao | assertion | + | **not** `indep_event.launch_date` |
| CL-121 | M-121 | `indep_event.launch_date` | 2026-08-15 | priya.raghunathan | assertion | + | global launch |
| CL-130 | M-130 | `onam_event.launch_date` | 2026-08-26 | priya.raghunathan | assertion | + | distinct referent |
| — | M-140 | — | — | — | proposal | — | **no claim emitted** |
| — | M-150 | — | — | — | question | — | **no claim emitted** |
| CL-160 | M-160 | `indep_event.launch_date` | 2026-08-15 | sana.kulkarni | **reported** | + | `attributed_to: priya.raghunathan`. Excluded from adjudication |
| CL-170 | M-170 | `indep_event.launch_date` | 2026-08-15 | meera.iyer | assertion | **−** | negative polarity |
| CL-180a | M-180 | `indep_event.duration` | 7 days from go-live | priya.raghunathan | assertion | + | |
| CL-180b | M-180 | `config_freeze.owner` | meera.iyer | priya.raghunathan | assertion | + | |
| CL-190 | M-190 | `reward_config.tiers` | 12 | rohan.desai | assertion | + | |
| CL-191 | M-191 | `reward_config.tiers` | 8 | meera.iyer | assertion | + | |
| CL-192 | M-192 | `reward_config.tiers` | 8 | rohan.desai | assertion | + | self-correction |
| — | M-200 to M-203 | — | — | — | — | — | **gated pre-extraction, never reach the extractor** |
| CL-210 to CL-216 | M-210 to M-216 | various | various | various | assertion | + | one claim each, no counterpart |

**Extraction grader scores:** claim recall, claim precision, referent accuracy,
modality accuracy, polarity accuracy, and span validity (binary, checked in code).

> Modality and polarity are scored **separately** from recall. A system that finds
> every claim but reads M-170 as positive should fail visibly, not average out.

---

## 3. Gold verdicts

Adjudication runs per referent bucket. Input is gold claims; output is a verdict.

| Bucket | Claims | Verdict | Scenario | Scored |
|---|---|---|---|---|
| `indep_event.launch_date` @ 15 Jul | CL-001, CL-002 | **CONTRADICTION** | C1 | Yes |
| `indep_event.launch_date` @ 18 Jul | + CL-110 | **RESOLVED_BY_SUPERSESSION** | N2 | Yes |
| `indep_event.success_criteria` | CL-010, CL-011 | **CONTRADICTION** | C2 | Yes |
| `liveops_calendar.signoff_owner` | CL-020, CL-021 | **CONTRADICTION** | C3 | Yes |
| `d7_retention.trend` | CL-030, CL-031 | **CONTRADICTION** | C4 | Yes |
| `tournament.scope` | CL-040, CL-041 | **CONTRADICTION** | C5 | Yes |
| `leaderboard.readiness` | CL-050, CL-051 | **CONTRADICTION** | C6 | Yes |
| `build_194.release_readiness` | CL-060, CL-061 | **CONTRADICTION** | C7 | Yes |
| `art_capacity.allocation` | CL-070, CL-071 | **CONTRADICTION** | C8 | Yes |
| `reward_config.live_state` | CL-080, CL-081 | **CONTESTED** | C9 | **No** |
| `level40_art.eta` | CL-100, CL-101 | **UPDATE** | N1 | Yes |
| `soft_launch.date` vs `indep_event.launch_date` | CL-120, CL-121 | **AMBIGUOUS_REFERENT** | N3 | Yes |
| `onam_event.launch_date` | CL-130 | **COMPATIBLE** (single claim) | N4 | Yes |
| `indep_event.duration`, `config_freeze.owner` | CL-180a, CL-180b | **COMPATIBLE** | N9 | Yes |
| `reward_config.tiers` @ 11:20 | CL-190, CL-191 | **CONTRADICTION** | N10 | Yes |
| `reward_config.tiers` @ 15:40 | + CL-192 | **RESOLVED_BY_CORRECTION** | N10 | Yes |
| Uncontested buckets ×7 | CL-210…216 | **COMPATIBLE** (single claim) | N12–18 | Yes |

### Temporal note on `indep_event.launch_date`

This bucket is deliberately the busiest in the corpus and is evaluated **at two
points in time**:

1. **As of 15 July**, CL-001 and CL-002 are both live and incompatible → CONTRADICTION.
2. **As of 18 July**, CL-110 lands from the studio head → RESOLVED_BY_SUPERSESSION.

CL-160 (reported speech) and CL-170 (negative polarity) sit in the same bucket
and must not create additional contradictions. CL-160 is excluded because it is
reported, not asserted. CL-170 is Meera restating her own position with negative
polarity against 15 August, consistent with CL-001 rather than a new conflict.

> **This is the single hardest bucket in the corpus and the best evidence that the
> ledger is stateful rather than a pairwise text diff.** If a submission gets only
> one thing right, it should be this.

---

## 4. Verdict vocabulary

| Verdict | Meaning |
|---|---|
| `CONTRADICTION` | Two live claims, different asserters, same referent, incompatible |
| `UPDATE` | Later claim supersedes earlier from the same asserter |
| `RESOLVED_BY_SUPERSESSION` | Authoritative asserter settles an open contradiction |
| `RESOLVED_BY_CORRECTION` | Original asserter withdraws or corrects |
| `AMBIGUOUS_REFERENT` | Claims appear to conflict but concern different things |
| `COMPATIBLE` | Same referent, no incompatibility |
| `CONTESTED` | Label genuinely arguable, excluded from headline scoring |

---

## 5. Metrics

**Headline: false positive rate across all must-not-flag scenarios, reported per
scenario, never averaged.**

| Metric | Definition |
|---|---|
| FP rate | Must-not-flag buckets incorrectly returning CONTRADICTION |
| Contradiction recall | Of 8 scored contradictions, how many surfaced |
| Verdict accuracy | Exact-match on the 7-way vocabulary |
| Claim recall / precision | Extraction grader, separately |
| Span validity | % of claims whose span appears verbatim in source |
| Modality accuracy | Scored separately from recall |
| Polarity accuracy | Scored separately from recall |

**Regression protocol:** fixture set frozen, baseline committed to
`evals/baseline.json`. Any prompt change re-runs the full suite and emits a
per-scenario diff. A change that improves the average but regresses any single
scenario is a failure, not a win.
