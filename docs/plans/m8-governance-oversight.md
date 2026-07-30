# M8 — Governance & Oversight

**Goal.** A full ExCom cycle and district-level oversight. `roadmap.md` §5. Final v1+ milestone.

**Depends on.** M5 library (minutes archive), M6 (Club Success Plan / DCP inputs), calibration before signals ship.

**Ship gate.** Full ExCom cycle; district-level oversight.

**Must be right.**

- Governance votes are **attributable**, meeting ballots are **anonymous** — different activities, different rules (`Motion.vote.record` names each voter; `Vote.voterHash`, M3, does not).
- Health and activeness are **private, band-only, and shipped after calibration** (principle 10).
- DCP is **always a projection, never official** — already built in M6, nothing new needed here.

**Scope note:** lean per-slice write-up, same convention as M4–M7. Schema accumulates across slices; no `prisma migrate`/`diff` against the database until the milestone's schema is fully written.

**Two items explicitly deferred, on the design docs' own instruction — not a time-pressure cut:**

- **Officer activeness scoring** (`system-design.md` §23.1). The design doc's own words: "ship the audit trail early and the score late, after several months of real data to calibrate against. Weights invented in advance produce numbers nobody trusts." The audit trail (`AuditEvent`, M2) already exists and already gives every input the formula needs (`Σ min(actual/expected, 1) × weight`); what's missing is calibrated weights from real usage, which don't exist a few hours into a fresh deployment. Building it now with placeholder weights would produce exactly the distrusted metric the design doc warns against. Deferred until there's real data.
- **Member-health signals** (`system-design.md` §11.3, `CLAUDE.md` §1). `CLAUDE.md` states the M8 dependency outright: "calibration before signals ship." No calibration had happened — same reasoning as activeness. `MemberHealthSignal`/`RetentionAlert`'s schema is fully specified in the design doc for whenever that calibration does happen; nothing about it is unclear or hard, it's just correctly out of scope for a session that can't perform real-world calibration.
  **Update, `CLAUDE.md` §2 decision 11 (2026-07-30):** a narrow v1 shipped ahead of this milestone, outside the M8 sequencing — `MemberHealthSignal.band` computed from `daysSinceLastSpeech` alone, VPM-only, behind the VP Membership dashboard. The multi-signal version and all of `RetentionAlert` remain deferred to this milestone as originally planned.

**Open decision 9 (minutes default visibility) — sidestepped, not resolved.** `CLAUDE.md` §2 lists this as still-open and blocks cutting a schema that presumes an answer. `Minutes.visibility` is modelled as a **required** field with no default — every draft must explicitly choose `officers`/`members`/`public` at creation time. This satisfies "don't presume an answer" without blocking the milestone: the decision is deferred to point-of-use, not baked into the schema.

---

## Slice breakdown

| #   | Slice                                                                   | New resource(s)                             | Context    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------- | ---------- |
| 1   | ExCom meetings — attendees, quorum, agenda                              | `governance.excom_meeting`                  | governance |
| 2   | Motions — attributable votes, effective-dated outcomes                  | `governance.motion`                         | governance |
| 3   | Minutes — self-drafting, approved-at-next-meeting, publishes to library | `governance.minutes`                        | governance |
| 4   | Division roll-up dashboard                                              | — (extends M6's area dashboard one tier up) | quality    |
| 5   | Cross-club support                                                      | `support.profile`, `support.request`        | support    |
| 6   | Dashboard UI                                                            | —                                           | dashboard  |

---

## Slice 1 — ExCom meetings

**Why:** `system-design.md` §13.1, `FR-GOV-1`.

**Schema:** `ExComMeeting` — `attendees: Json[]` (`{personId, role, present, apologies}`), `agenda: Json[]`, `quorumRule: string`, `quorumMet: boolean`, `status: scheduled|in_progress|minuted|approved`.

**API:** `POST/GET /clubs/:clubUnitId/excom-meetings` · `PATCH :id` (attendees/agenda/quorum) · `POST :id/status` (lifecycle advance).

---

## Slice 2 — Motions

**Why:** `system-design.md` §13.2, `FR-GOV-2`. `Motion.vote.record` names each voter — the opposite of M3's anonymous award ballots, and deliberately so.

**Schema:** `Motion` — `excomMeetingId`, `seq` (per-meeting sequence), `movedByPersonId`, `secondedByPersonId`, `vote: Json?` (`{method, for, against, abstain, record: [{personId, choice}] | null}`), `outcome: carried|failed|withdrawn|tabled|no_second`, `effectiveFrom`, `supersedesMotionId`.

**API:** `POST/GET /clubs/:clubUnitId/excom-meetings/:excomMeetingId/motions` · `POST :id/vote` (records the attributable vote and derives `outcome`) · `POST :id/withdraw`.

---

## Slice 3 — Minutes

**Why:** `system-design.md` §13.3, `FR-GOV-3/4/5`. Draft, circulate, approve at the _next_ meeting, publish — approved minutes are immutable; a correction is a new version.

**Schema:** `Minutes` — `source: Json` (`{kind: 'excom', excomMeetingId} | {kind: 'club_meeting', meetingId}`), `body: string` (auto-seeded from the ExCom meeting's agenda/attendees/motions at draft time, then hand-edited for narrative), `approvedAt`/`approvedByPersonId` (null until approved at the _following_ meeting), `publishedAt`, `visibility` (required, no default — see the open-decision-9 note), `version`, `supersedesId`.

**API:** `POST /clubs/:clubUnitId/excom-meetings/:excomMeetingId/minutes` (drafts — auto-seeds `body` from the meeting's own agenda/attendees/motion outcomes) · `GET /clubs/:clubUnitId/minutes` · `POST :id/approve` · `POST :id/publish` (creates a `library.governance_document` `LibraryItem` in the same call — `FR-GOV-5`'s "the archive is a consequence, not a filing chore," reusing M5's library rather than a parallel store) · `POST :id/new-version` (correction — never edits an approved row).

---

## Slice 4 — Division roll-up dashboard

**Why:** `system-design.md` §22's Division Director interface: "Area roll-up with aggregated visit compliance." Same shape as M6's `GET /areas/:id/dashboard`, one tier up — walks the org subtree from a division down through its areas' clubs.

**API:** `GET /divisions/:divisionUnitId/dashboard?programYearId=` — per-area visit-compliance aggregates (reuses `AreaVisitReportRepository.countSubmittedByArea`), not per-club — `FR-OVS-3`: oversight beyond the area tier sees area-level aggregates, not individual club rows, one more step removed from member detail.

---

## Slice 5 — Cross-club support

**Why:** `system-design.md` §17, `FR-SUP-1/2/3`. Opt-in, coarse-geohash, function-scoped-only participation.

**Schema:** `SupportProfile` — one per person, `isDiscoverable: boolean` default **false**, `consentAt`/`consentVersion`, `locations: Json[]` (`{label, geohash, precision: 5}` — never raw coordinates, `FR-SUP-2`), `availableRoles: String[]`, `mentorFor: String[]`, `maxTravelKm`, `blackoutDates: Date[]`. `SupportRequest` — `requestingUnitId`, `meetingId`, `roleKey`, `neededBy`, `invitees: Json[]` (`{personId, invitedAt, response, respondedAt}`), `status: open|filled|expired|cancelled`.

**API:** `POST /support-profile` (self-service opt-in, versioned consent) · `GET /clubs/:clubUnitId/support-requests` · `POST` (create + invite candidates, geohash-band matched — never exact distance) · `POST :id/respond`. An accepted request creates a `cross_club` `MeetingRoleAssignment` (M3) with function-scoped visibility for that meeting only; the external member earns **no education credit** (`FR-SUP-3`) — no `EducationRecord` write happens from this path.

**Scope cut:** distance-band matching is dropped entirely, not simplified — `OrgUnit` carries no location of its own anywhere in the schema (`system-design.md` never models club geolocation), so there is no reference point to band a candidate's geohash against. Invite candidates are every discoverable volunteer for the requested role, unordered. `SupportProfile.locations` still stores only coarse geohashes (`FR-SUP-2`) and nothing here exposes a precise location — the gap is in ranking by proximity, not in the privacy posture.

---

## Slice 6 — Dashboard UI

ExCom meeting + motion recording, minutes drafting/approval/publish flow, division dashboard (visit-compliance-led, same shape as M6's area dashboard), support-profile opt-in toggle + support-request board.

**Scope cut:** motions are moved via the ExCom panel, but recording an attributable vote (`POST :id/vote`) has no dedicated UI widget yet — the API fully supports it (per-voter choice, derived outcome), it's just not wired to a form in this pass. Same class of cut as M7's audio/scan evaluation modes: the backend is complete, a specific interaction hasn't been built.
