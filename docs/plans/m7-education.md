# M7 — Education (post-v1, but onboarding before the first July)

**Goal.** A member completes a level, the VPE confirms, a new member is paired and onboarded. `roadmap.md` §5.

**Depends on.** M3 close-out events; M5 library (onboarding steps attach files).

**Ship gate.** A member completes a level; the VPE confirms; a new member is paired and onboarded.

**Must be right.**

- Completion comes from **close-out events, not self-report** (`FR-EDU-2`).
- Only the **VPE-confirmed date feeds DCP** (`FR-EDU-3`).
- Evaluations visible to **speaker and VPE only** by default (`FR-EDU-5`).
- **Onboarding tracks must exist before the first July** (`FR-EDU-7`).

**Scope note:** lean per-slice write-up, same convention as M4–M6. Schema accumulates across slices; no `prisma migrate`/`diff` against the database until the milestone's schema is fully written.

**Closes an M6 gap:** the M6 `DcpProjection` job marked education goals 1–6 `not_yet_tracked` because no education data existed. Slice 1 of this milestone (`EducationRecord`) gives it a real source — Slice 5 here goes back and wires goals 1–6 to VPE-confirmed level completions, as the M6 plan doc's scope-sequencing note said to do "when M7 ships."

**Scope cuts, flagged not hidden:**

- **Automatic onboarding enrolment** (`GuestConverted` → `new_member`, `RoleAssignmentCreated` → `new_officer`, `ProgramYearRolled` → all incoming officers) is not wired — there is no domain-event bus in this codebase yet (M2/M4's writes are direct repository calls, not published events), and retrofitting one to reach into already-shipped M2/M4 modules from this branch is a bigger change than this slice justifies. Enrolment is an explicit officer-initiated endpoint instead (`POST .../onboarding-progress`). `MentorshipAccepted` → `mentor` track has the same gap.
- **Per-level required-role-key validation** (`FR-EDU-2`'s "requires the level's designated meeting roles") is simplified to "the level's `PathwayProject` speeches are delivered" — the trimmed M3 `PathwayProject` catalog (`system-design.md` §10.1's scoping note) never carried a `requiredRoleKeys` list per level, only per-project minute ranges. Extending the catalog with that data is straightforward but the source data (which roles beyond speaking are required per level) isn't in `prd.md`/`system-design.md` in enough detail to seed honestly. Mark-complete still isn't self-report: it's gated on the path's `PathwayProject` rows actually being delivered (`SpeechSlot.status = 'approved'` on a `closed` meeting), just not the full role-requirement list.

---

## Slice breakdown

| #   | Slice                                                     | New resource(s)                                                | Context   |
| --- | --------------------------------------------------------- | -------------------------------------------------------------- | --------- |
| 1   | Education records — level tracking, two-step confirmation | `education.record`                                             | education |
| 2   | Evaluations                                               | `education.evaluation` (already seeded, zero grants until now) | education |
| 3   | Mentorship — pairings, availability, ranked suggestions   | `education.mentorship`                                         | education |
| 4   | Onboarding tracks + progress                              | `education.onboarding`                                         | education |
| 5   | Wire DCP goals 1-6 to confirmed level completions         | — (worker change)                                              | quality   |
| 6   | Dashboard UI                                              | —                                                              | dashboard |

---

## Slice 1 — Education records

**Why:** `system-design.md` §10.1. The two-step confirmation is the load-bearing invariant — `FR-EDU-3`.

**Schema:** `EducationRecord` — one per `(personId, clubUnitId, pathCode)`, `levels: Json` (`{ level, projectsDelivered: [{projectCode, speechSlotId, deliveredAt}], educationSeriesPresentation, memberMarkedCompleteAt, vpeConfirmedAt, vpeConfirmedBy, tiAwardRecordedAt, provenance }[]`).

**API:** `POST /clubs/:clubUnitId/education-records` (VPE creates, one per person+path) · `GET /clubs/:clubUnitId/education-records?personId=` · `POST /education-records/:id/levels/:level/mark-complete` (member-initiated, but the service checks the level's `PathwayProject` rows are actually delivered before accepting — not free-form self-report) · `POST /education-records/:id/levels/:level/confirm` (VPE only; this is the date that ever feeds DCP).

---

## Slice 2 — Evaluations

**Why:** `system-design.md` §10.2, `FR-EDU-4/5`. `metricsSnapshot` is copied at submission time so a later timer correction can't silently rewrite feedback.

**Schema:** `SpeechEvaluation` — `subjectKind: prepared_speech|table_topic`, `mode: form|audio|scan`, `formScales/formExcelledAt/formWorkOn/formChallengeYourself` (nullable — only for `mode: form`), `audioUrl`/`scanUrl` (nullable, mode-dependent), `metricsSnapshot: Json` (copied, never referenced back to the live timer/ah-counter record), `visibility: speaker_and_vpe|speaker_only`.

**API:** `POST /clubs/:clubUnitId/evaluations` · `GET /clubs/:clubUnitId/evaluations?speakerPersonId=` (query-level filtered to the caller's own evaluations-as-speaker or VPE, per `FR-EDU-5` — same "filter in the repository, not just the RBAC condition" pattern the M6 plan doc documents for tickets, since the fixed condition vocabulary can't express "speaker or VPE" either).

**Grants:** first grants ever added to `education.evaluation` (seeded restricted in M1, zero grants until now) — `club_vpe` read/create/update, `club_member` read own-as-speaker (query-filtered, same own-condition caveat as every M4 `own` grant).

---

## Slice 3 — Mentorship

**Why:** `system-design.md` §10.3, `FR-EDU-6`. Ranked suggestions, never automatic pairing.

**Schema:** `MentorshipPairing` (`purpose`, `status`, `goals: Json[]`, `checkIns: Json[]` — ending a pairing never deletes this history) and `MentorAvailability` (`isAvailable`, `maxConcurrentMentees` default 2, `strengths: String[]`, `preferredPurposes: String[]`).

**API:** `POST/GET /clubs/:clubUnitId/mentor-availability` · `GET /clubs/:clubUnitId/mentorship/suggestions?menteePersonId=` (ranks by the §10.3 formula: pathway overlap, strength match, tenure, minus current load, minus prior `mismatch` pairings with this mentee) · `POST/GET /clubs/:clubUnitId/mentorship-pairings` · `POST :id/check-ins` · `POST :id/end`.

**Invariant enforced in the service, not the DB:** at most one `active` pairing per `(menteePersonId, purpose)` — checked before insert, same class of invariant as the singleton-role check pattern, but without a partial unique index (the uniqueness key spans a JSON-adjacent concept — `purpose` isn't a column on a simple pairing-per-slot table the way `RoleAssignment`'s singleton is). Flagged as a known race window under concurrent requests, same honesty standard as the rest of this plan.

---

## Slice 4 — Onboarding tracks + progress

**Why:** `system-design.md` §10.4, `FR-EDU-7`. Must exist before the first July, even though M7 ships post-v1.

**Schema:** `OnboardingTrack` (`orgUnitId: String?` — null means district-wide default, `audience`, `forRoles: String[]`, `steps: Json[]`) and `OnboardingProgress` (`steps: Json[]` — snapshot of the track's steps at enrolment time, same "don't let a later template edit rewrite history" pattern as M3's `ChecklistRun`).

**API:** `POST/GET /clubs/:clubUnitId/onboarding-tracks` · `POST /clubs/:clubUnitId/onboarding-progress` (explicit enrolment — see the scope-cut note on automatic triggers) · `POST /onboarding-progress/:id/steps/:key/complete` · `GET /clubs/:clubUnitId/onboarding-progress?personId=`.

---

## Slice 5 — Wire DCP goals 1-6

**Why:** closes the gap the M6 plan doc explicitly deferred.

**Change:** `apps/worker/src/processors/dcp-projection.processor.ts` — goals 1/2/3/4/5/6 (Level 1/2/2/3/4-5/4-5 awards) now count `EducationRecord.levels[].vpeConfirmedAt != null` at the matching level, `dataSource: 'computed'`, `contributingRecordIds` pointing at the `EducationRecord` ids. Goals 9/10 stay `not_yet_tracked` — training periods and officer-list submission still aren't modelled anywhere.

---

## Slice 6 — Dashboard UI

Education record list + mark-complete/confirm actions; evaluation submission form (structured form mode only in the UI — audio/scan upload reuses the M5 signed-URL flow but isn't wired into a dedicated recorder/scanner widget, a scope cut); mentorship suggestions + pairing list; onboarding track list + progress checklist.
