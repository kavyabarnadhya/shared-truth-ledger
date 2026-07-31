# Fixture Corpus Specification
**Ludo Junction / Tamarind Games — synthetic Slack + Gmail corpus for shared-truth ledger evals**

Fictional studio modelled on the casual board-game segment. No real company data is used.
All names, messages, metrics and dates are invented for evaluation purposes.

---

## 1. World

| Field | Value |
|---|---|
| Studio | Tamarind Games, Bangalore |
| Title | Ludo Junction (casual board game, live-service) |
| Corpus window | 6 July 2026 – 24 July 2026 |
| Primary event | Independence Day event (contested go-live: 12 vs 15 August 2026) |
| Secondary event | Onam event (target go-live 26 August 2026) — exists to test near-miss referents |
| Current build | 1.9.4 |

---

## 2. Cast

| Handle | Name | Role | Notes |
|---|---|---|---|
| `meera.iyer` | Meera Iyer | Product Manager | **The user.** Ledger is from her perspective |
| `priya.raghunathan` | Priya Raghunathan | Producer | Timelines, resourcing, asserts sign-off authority |
| `rohan.desai` | Rohan Desai | Game Designer | Creative vision, player experience |
| `sana.kulkarni` | Sana Kulkarni | Art Lead | Shared, reallocatable capacity |
| `vikram.shetty` | Vikram Shetty | Engineering Lead | Technical feasibility |
| `neha.bhatt` | Neha Bhatt | Data Analyst | Product-side metrics |
| `arjun.rao` | Arjun Rao | UA Lead | Paid-install metrics, creatives |
| `farah.qureshi` | Farah Qureshi | QA Lead | Release gating |
| `deepak.menon` | Deepak Menon | Community & Support | Player-reported reality |
| `karthik.nair` | Karthik Nair | Studio Head | Supersession authority |
| `ci-bot` | CI Bot | Automation | Noise |
| `noreply@play.google.com` | Play Console | Automation | Noise |
| `newsletter@gamedevweekly.com` | GameDev Weekly | Newsletter | Noise |

---

## 3. Channels and threads

**Slack**
- `#liveops-ludojunction` — T1 event planning, T8 Onam planning, T11 misc
- `#art-pipeline` — T3
- `#eng-backend` — T4
- `#qa-releases` — T5
- `#support-signals` — T9
- `#build-ci` — T10 (noise)
- DM `meera.iyer ↔ rohan.desai` — T7

**Gmail**
- T2 "Ludo Junction — Independence Day event release sign-off"
- T6 "Weekly product metrics — w/c 13 July"
- T12 Play Console + newsletter (noise)

---

## 4. Referents

Canonical keys the resolver must converge on.

| Key | Description |
|---|---|
| `indep_event.launch_date` | Go-live date for the Independence Day event |
| `indep_event.success_criteria` | Definition of success for the event |
| `indep_event.reward_config` | Reward table configuration |
| `liveops_calendar.signoff_owner` | Who holds final sign-off |
| `level40_art.eta` | Delivery date for the Level 40 art pack |
| `art_capacity.allocation` | Where the art team's capacity is committed |
| `tournament.scope` | What ships in v1 of Tiranga tournament mode |
| `leaderboard.readiness` | When the leaderboard backend is safe to ship |
| `build_194.release_readiness` | Whether build 1.9.4 can ship |
| `d7_retention.trend` | Direction of D7 retention |
| `onam_event.launch_date` | Go-live for the Onam event |
| `launch.type` | Soft launch vs global launch (ambiguity trap) |
| `reward_config.live_state` | Whether the new reward table is actually live |

---

## 5. Load-bearing messages

**These are exact. Do not paraphrase, reword, or "improve" them.** Each one carries a
claim the graders depend on. Filler messages are generated around them (§7).

### C1 — Launch date conflict (cross-channel, 9 days apart) → CONTRADICTION · Easy

```
M-001 | slack | #liveops-ludojunction | meera.iyer | 2026-07-06T10:12+05:30
Kicking off planning for the Independence Day event. Working assumption is we go
live 12 August, config frozen by the 5th so QA gets a clean week.
```

```
M-002 | gmail | "Ludo Junction — Independence Day event release sign-off" | priya.raghunathan | 2026-07-15T18:22+05:30
To: meera.iyer, karthik.nair, farah.qureshi, vikram.shetty
Sharing the release plan for the Independence Day event. Go-live is 15 August,
aligned to the holiday itself. Sign-off gate is the 12th.
```

### C2 — Success criteria conflict (semantic, cross-thread) → CONTRADICTION · Medium

```
M-010 | slack | #liveops-ludojunction | meera.iyer | 2026-07-07T09:48+05:30
Success on this one is ARPDAU lift across the seven-day window. Everything else
is secondary.
```

```
M-011 | slack | DM meera.iyer↔rohan.desai | rohan.desai | 2026-07-14T16:20+05:30
I want to push back on how we're framing success here. We got hammered on Holi
for pushing offers. Success for this event should be session depth and returning
players, not ARPDAU.
```

### C3 — Contested sign-off ownership → CONTRADICTION · Medium

```
M-020 | gmail | (same thread as M-002) | priya.raghunathan | 2026-07-16T12:00+05:30
As producer I'll hold final sign-off on the live ops calendar, same as we did for Holi.
```

```
M-021 | slack | #liveops-ludojunction | meera.iyer | 2026-07-17T11:05+05:30
Calendar sign-off sits with me. That was the whole point of the change we made
after Holi.
```

### C4 — Data interpretation conflict (same metric, different cut) → CONTRADICTION · Hard

```
M-030 | gmail | "Weekly product metrics — w/c 13 July" | neha.bhatt | 2026-07-20T09:30+05:30
D7 retention is up 1.8pp week on week, driven mostly by the returning-player cohort.
```

```
M-031 | slack | #liveops-ludojunction | arjun.rao | 2026-07-21T15:12+05:30
D7 is down, not up. My cut on paid installs has seven-day retention off 3pp since
the 1.9.3 patch.
```

### C5 — Scope understood differently → CONTRADICTION · Hard

```
M-040 | slack | DM meera.iyer↔rohan.desai | meera.iyer | 2026-07-14T16:44+05:30
On tournament mode, we cut the bracket system for v1. It's a flat leaderboard only.
```

```
M-041 | slack | #liveops-ludojunction | rohan.desai | 2026-07-18T12:30+05:30
Spent this morning on bracket seeding rules for the Tiranga tournament. Should have
the seeding logic ready for review by Tuesday.
```

### C6 — Engineering feasibility vs commitment → CONTRADICTION · Medium

```
M-050 | slack | #eng-backend | vikram.shetty | 2026-07-14T10:05+05:30
Leaderboard migration for tournament mode depends on the new shard rollout. That's
three weeks minimum, so the earliest date I'd call safe is 25 August.
```

```
M-051 | slack | #liveops-ludojunction | meera.iyer | 2026-07-06T11:15+05:30
Theme is tricolour board skins and a token set, plus a limited-time Tiranga
tournament mode shipping with the event.
```

### C7 — QA readiness vs ship date → CONTRADICTION · Easy

```
M-060 | slack | #qa-releases | farah.qureshi | 2026-07-22T17:40+05:30
Build 1.9.4 has an open P1 — token animation desyncs on reconnect. This is not
release-ready.
```

```
M-061 | slack | #qa-releases | priya.raghunathan | 2026-07-23T09:15+05:30
We're shipping 1.9.4 on Friday. It's already in the store review queue.
```

### C8 — Art capacity reallocated → CONTRADICTION · Medium

```
M-070 | slack | #art-pipeline | sana.kulkarni | 2026-07-20T14:25+05:30
Heads up, I'm moving two artists onto the Onam board set from tomorrow so we hit
that milestone.
```

```
M-071 | gmail | (same thread as M-002) | priya.raghunathan | 2026-07-21T10:40+05:30
Art is fully committed to the Independence assets through the 5th, so we're covered
on the visual side.
```

### C9 — Support reality vs believed state → **BOUNDARY CASE, excluded from headline scoring** · Hard

```
M-080 | slack | #support-signals | deepak.menon | 2026-07-23T13:20+05:30
Steady trickle of reports that players are still seeing the old Holi reward table
in the shop.
```

```
M-081 | slack | #support-signals | meera.iyer | 2026-07-23T13:52+05:30
The reward config was updated on the 18th. It's live.
```

> **Why contested:** both may be true simultaneously — a staged rollout or client
> cache means the config is live server-side and stale for some players. Label is
> genuinely arguable. Reported separately, never folded into headline precision.

---

## 6. Must-not-flag messages

### N1 — Self-revision → UPDATE · Easy
```
M-100 | slack | #art-pipeline | sana.kulkarni | 2026-07-09T11:30+05:30
Level 40 art pack, first pass lands 24 July.

M-101 | slack | #art-pipeline | sana.kulkarni | 2026-07-13T15:05+05:30
Revising that — Level 40 pack will be 29 July. Token rework took longer than I scoped.
```

### N2 — Authoritative supersession → UPDATE · Medium
```
M-110 | gmail | (thread M-002) | karthik.nair | 2026-07-17T20:15+05:30
Let's go with the 15th. Aligning to the holiday itself is worth more than the
extra three days of runway. Final.
```

### N3 — Ambiguous referent → AMBIGUOUS_REFERENT · Hard
```
M-120 | slack | #liveops-ludojunction | arjun.rao | 2026-07-13T10:20+05:30
Launch is the 5th for us — that's when the Canada and NZ cohort gets it.

M-121 | slack | #liveops-ludojunction | priya.raghunathan | 2026-07-13T10:44+05:30
Launch is the 15th.
```
> Both correct. Arjun means soft launch, Priya means global.

### N4 — Near-miss referent → COMPATIBLE · Hard
```
M-130 | slack | #liveops-ludojunction | priya.raghunathan | 2026-07-20T16:00+05:30
Onam event target go-live is 26 August. Putting it on the calendar now.
```
> Superficially similar to `indep_event.launch_date`. Must resolve to a
> different referent, not a conflicting value.

### N5 — Hedge / proposal → NOT A CLAIM · Medium
```
M-140 | slack | #liveops-ludojunction | rohan.desai | 2026-07-15T14:10+05:30
What if we pushed the tournament to September and shipped just the skins in August?
```

### N6 — Question → NOT A CLAIM · Easy
```
M-150 | slack | #liveops-ludojunction | arjun.rao | 2026-07-16T09:05+05:30
Is the go-live date still the 12th?
```

### N7 — Reported speech → NOT A FIRST-PARTY CLAIM · Hard
```
M-160 | slack | #art-pipeline | sana.kulkarni | 2026-07-17T12:15+05:30
Priya said it's the 15th now, so I've replanned the asset drops around that.
```
> Sana is not asserting the date. Treating her as asserter creates a false
> contradiction against M-001.

### N8 — Negation / polarity → CLAIM WITH NEGATIVE POLARITY · Hard
```
M-170 | slack | #liveops-ludojunction | meera.iyer | 2026-07-16T18:30+05:30
To be clear, we are not going with the 15th. Nothing has changed on my side.
```
> Extraction must capture polarity. Reading this as asserting the 15th inverts
> the entire ledger.

### N9 — Compatible claims, same referent family → COMPATIBLE · Easy
```
M-180 | slack | #liveops-ludojunction | priya.raghunathan | 2026-07-08T10:05+05:30
Event runs seven days from go-live, and Meera owns the config freeze.
```

### N10 — Raised then reconciled → RESOLVED, CLOSED · Medium
```
M-190 | slack | #liveops-ludojunction | rohan.desai | 2026-07-10T11:00+05:30
Reward table has 12 tiers in the design doc.

M-191 | slack | #liveops-ludojunction | meera.iyer | 2026-07-10T11:20+05:30
Config only has 8 tiers built.

M-192 | slack | #liveops-ludojunction | rohan.desai | 2026-07-10T15:40+05:30
My mistake, doc was stale. 8 tiers is correct, I've updated it.
```

### N11 — Bot and automation noise → GATED PRE-EXTRACTION · Easy
```
M-200 | slack | #build-ci | ci-bot | 2026-07-14T03:12+05:30
Pipeline #4471 FAILED on branch feature/tournament-seeding — 2 tests failing.

M-201 | gmail | Play Console | noreply@play.google.com | 2026-07-19T06:00+05:30
Your app Ludo Junction has a new review (3 stars).

M-202 | gmail | GameDev Weekly | newsletter@gamedevweekly.com | 2026-07-20T07:30+05:30
This week: five studios on why live ops calendars slip.

M-203 | slack | #liveops-ludojunction | priya.raghunathan | 2026-07-15T13:00+05:30
lunch? 🍛
```

### N12–N18 — Uncontested single claims (base-rate padding)

One assertion each, no counterpart anywhere in the corpus. Each creates a
referent bucket with exactly one live claim.

| ID | Author | Content |
|---|---|---|
| M-210 | vikram.shetty | Push notification service upgrade lands 30 July |
| M-211 | neha.bhatt | Event dashboard will be ready by the 8th |
| M-212 | arjun.rao | Creative refresh for the August burst is booked with the agency |
| M-213 | farah.qureshi | Regression suite now covers the reconnect path |
| M-214 | sana.kulkarni | Tricolour token set is at final polish |
| M-215 | deepak.menon | FAQ update for the event is drafted |
| M-216 | rohan.desai | Difficulty curve for levels 38–42 is rebalanced |

---

## 7. Filler generation rules

Generate connective messages around the load-bearing ones so threads read as real
conversation. Target **70–80 messages total**.

**Do**
- 4–9 messages per thread, plausible working hours IST, weekday-clustered
- Acknowledgements, scheduling chatter, mild disagreement that resolves, emoji reactions
- Occasional typos, lowercase starts, truncated sentences in Slack
- Formal register in Gmail: greetings, sign-offs, threaded replies
- Let some threads trail off without conclusion

**Do not**
- Introduce any new assertion about a referent listed in §4
- Restate, contradict, or hint at any load-bearing claim
- Add named dates, metrics, owners, or scope statements of any kind
- Add a second studio, second title, or any character outside the cast

> **Rule of thumb:** if a filler message contains a number, a date, a name in a
> possessive sense, or the word "success", it is probably contaminating a referent.
> Rewrite it.

---

## 8. Message schema

```json
{
  "id": "M-001",
  "source": "slack",
  "channel": "#liveops-ludojunction",
  "thread_id": "T1",
  "author": "meera.iyer",
  "author_name": "Meera Iyer",
  "author_role": "Product Manager",
  "timestamp": "2026-07-06T10:12:00+05:30",
  "text": "...",
  "participants": ["meera.iyer", "priya.raghunathan", "rohan.desai"],
  "is_load_bearing": true
}
```

Gmail messages replace `channel` with `subject` and add `to` (array) and `from`.

---

## 9. Scenario ledger

| ID | Scenario | Stakeholders | Expected | Difficulty | Scored |
|---|---|---|---|---|---|
| C1 | Launch date, Slack vs Gmail | PM vs Producer | CONTRADICTION | Easy | Yes |
| C2 | Success criteria | PM vs Designer | CONTRADICTION | Medium | Yes |
| C3 | Sign-off ownership | PM vs Producer | CONTRADICTION | Medium | Yes |
| C4 | D7 retention direction | Data vs UA | CONTRADICTION | Hard | Yes |
| C5 | Tournament scope | PM vs Designer | CONTRADICTION | Hard | Yes |
| C6 | Leaderboard feasibility | Eng vs PM | CONTRADICTION | Medium | Yes |
| C7 | Build 1.9.4 readiness | QA vs Producer | CONTRADICTION | Easy | Yes |
| C8 | Art capacity | Art vs Producer | CONTRADICTION | Medium | Yes |
| C9 | Reward config live state | Support vs PM | Contested | Hard | **No** |
| N1 | Self-revision | Art | UPDATE | Easy | Yes |
| N2 | Studio head override | Studio Head | UPDATE | Medium | Yes |
| N3 | Soft vs global launch | UA vs Producer | AMBIGUOUS | Hard | Yes |
| N4 | Onam vs Independence | Producer | COMPATIBLE | Hard | Yes |
| N5 | Hedge | Designer | NOT A CLAIM | Medium | Yes |
| N6 | Question | UA | NOT A CLAIM | Easy | Yes |
| N7 | Reported speech | Art | NOT FIRST-PARTY | Hard | Yes |
| N8 | Negation | PM | NEGATIVE POLARITY | Hard | Yes |
| N9 | Compatible claims | Producer | COMPATIBLE | Easy | Yes |
| N10 | Raised then reconciled | Designer, PM | RESOLVED | Medium | Yes |
| N11 | Bot and social noise | — | GATED | Easy | Yes |
| N12–18 | Uncontested claims | Various | NO FLAG | Easy | Yes |

**Totals:** 8 scored contradictions, 1 contested and excluded, ~20 must-not-flag
scenarios, ~30 referent buckets.

**Base rate:** roughly 27% of referent buckets carry a genuine conflict. This is
higher than production reality, which is a deliberate and stated limitation —
the corpus is sized for signal per scenario, not for base-rate realism. Production
measurement needs an observed base rate from a real workspace.

---

## 10. Known limitations

1. **Self-authored labels.** One annotator, no measured inter-annotator agreement.
2. **Base rate inflated** (§9).
3. **Synthetic register.** Real Slack is messier — voice notes, threads inside
   threads, screenshots carrying the actual claim. None of that is represented.
4. **English only.** A real Bangalore studio mixes languages in Slack.
5. **No attachments or documents.** Several real contradictions live in a spec
   doc versus a message, which this corpus cannot represent.
6. **C9 label is arguable** and excluded from headline scoring by design.
