# M6 — Area Tier (v1 cut line)

**Goal.** An Area Director runs their year on the dashboard they are actually measured on. `roadmap.md` §5. **This is where v1 ships.**

**Depends on.** M1 scoping (oversight = aggregates only), M4 (club health inputs).

**Ship gate.** An Area Director runs their year; the dashboard leads with **visit compliance**, not attendance (`FR-OVS-6`).

**Must be right.**

- Oversight sees **aggregates, never member detail** (`FR-OVS-3`).
- Tickets tag **roles as well as people** so they survive the handover (`FR-OVS-1`).
- DCP projection is always labelled **"Projected"**, never official (`FR-OVS-5`).

**Scope note:** lean per-slice write-up, same convention as M4/M5. Schema changes accumulate across all M6 slices; `prisma generate` after each, no `prisma migrate`/`diff` against the database until the milestone's schema is fully written.

**Scope-sequencing note — DCP projection ahead of M7/M8:** `DcpProjection` (`FR-OVS-5`) is explicitly M6-scoped (`roadmap.md` traces `FR-OVS-1…7` to M6), but two of its ten goals' data sources don't exist yet: goals 1–6 (education levels, M7) and goal 9 (officer training periods, not yet modelled anywhere). Rather than block M6 on M7, or guess at a training-period schema, the projection computes what it can from what's actually recorded: goals 7/8 (new/dual/reinstating members) from `ClubMembership`. Goal 10 is a _joint_ condition (on-time dues for ≥8 members **and** on-time officer-list submission) — the portal has no record of "officer list submitted to TI" at all, so computing the dues half alone and calling the goal `achieved` would misrepresent a condition that's actually only half-checked; it stays `not_yet_tracked` alongside goals 1–6/9 rather than a partially-honest number. — an honest reflection of what the portal has recorded, not a guess at what happened in real life. `FR-OVS-5`'s "always labelled Projected" requirement already covers this: an incomplete-but-honest projection is still a projection. Revisit when M7 ships.

**Also carried forward:** `system-design.md` §17 (cross-club support) is not in `roadmap.md`'s M6 content list and is skipped here — no milestone currently claims it.

---

## Slice breakdown

| #   | Slice                                                                             | New resource(s)                                              | Context    |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------- |
| 1   | Area visit reports + President contact log                                        | `quality.area_visit_report`, `quality.president_contact_log` | quality    |
| 2   | Club Success Plan                                                                 | `governance.club_success_plan`                               | governance |
| 3   | DCP projection — nightly job                                                      | `quality.dcp_projection` (read-only)                         | quality    |
| 4   | Club health snapshot — monthly job                                                | `quality.health_snapshot` (read-only)                        | quality    |
| 5   | Tickets                                                                           | `quality.ticket`                                             | quality    |
| 6   | Role templates — Area Director, Division Director                                 | (grants only)                                                | access     |
| 7   | Dashboard UI — Area dashboard (visit-compliance-led), tickets, CSP, visit reports | —                                                            | dashboard  |

## Design notes carried from the design docs

- **Scope stays club-anchored, not area-anchored.** `AreaVisitReport`/`PresidentContactLog`/`ClubSuccessPlan` are club-scoped resources (`clubUnitId` in the URL, matching every other club-scoped route). An Area Director's grant is anchored at their _area_ unit with `scopeRule: 'self_subtree'`; since a club's `ltree` path is a descendant of its area's, the existing prefix-match scope check (`system-design.md` §5.1/§7.1) authorizes the Area Director on their clubs' resources without a second scoping mechanism. No new scope primitive needed.
- **Tickets follow `system-design.md` §20.2's literal API shape** — a flat `GET/POST /tickets?scope=<orgUnitId>` rather than a nested club route, since a ticket's `scopeUnitId` can be any org-tier unit, not only a club (`clubScoped: false` in the seed, matching `org.unit`). Visibility (`FR-OVS-1`: creator ∪ tagged parties ∪ any principal whose scope prefixes the ticket's unit) is enforced by the repository's list query, not by the RBAC condition alone — the fixed `party` condition is seeded on the grant as the documented intent, but list-endpoint filtering is what actually restricts the rows (`CLAUDE.md` §6: "list endpoints filter in the query"). This inherits the same pre-existing gap M4 flagged: `ResourceGuard` never builds an ownership/party `context` object, so a `party`-conditioned grant can't resolve true through the declarative gate alone — not introduced by this slice, already true for every `own`-conditioned M4 grant.
- **`ClubHealthSnapshot`, not `MemberHealthSignal`.** Roadmap's M6 line item "health snapshots" is club-level aggregate data (meetings held, attendance, member count, roles-filled%) for the Area dashboard's club cards (`system-design.md` §19.4) — not the M4-adjacent `MemberHealthSignal`/`RetentionAlert` (§11.3), which `CLAUDE.md` §1 explicitly gates on **calibration**, shipped only alongside M8. Building member-level health here would violate that gate; the club-level snapshot does not.

---

## Slice 1 — Area visit reports + President contact log

**Why:** `system-design.md` §16.2. The Area Director's mandatory, measurable artefact — reports for ≥75% of the club base by 30 Nov and 31 May is the Distinguished Area qualifier.

**Schema:** `AreaVisitReport` (six Moments of Truth ratings 1–5 + observations/recommendations per standard, `round: R1|R2`, `status: draft|submitted`) and `PresidentContactLog` (monthly contact record, `dcpDiscussed: boolean`) — both club-scoped, `areaUnitId` carried as a plain field (not the scope key) since the filing Area Director's grant is what authorizes the write.

**API:** `POST/GET /clubs/:clubUnitId/visit-reports` · `POST :id/submit` · `POST/GET /clubs/:clubUnitId/contact-log`.

---

## Slice 2 — Club Success Plan

**Why:** `system-design.md` §13.4. DCP qualifying requirement, due 30 Sep; the President's live planning artefact, rendered against the DCP projection goal-by-goal.

**Schema:** `ClubSuccessPlan` — one per `(clubUnitId, programYearId)`, `goalTargets: Json` (per-goal target/owner/strategy/milestones), `status: draft|submitted|revised`, `contributors: Json`.

**API:** `POST/GET /clubs/:clubUnitId/success-plan?programYearId=` · `POST :id/submit` · `POST :id/reviews` (quarterly review note).

**Scope cut:** rollover auto-seeding next year's draft from this year's outcome is deferred — no rollover job exists yet anywhere in the codebase (same gap M4 flagged for the handover financial report). The plan can be created manually each year.

---

## Slice 3 — DCP projection (nightly job)

**Why:** `system-design.md` §16.3, `FR-OVS-5`. See the milestone-level scope-sequencing note above for what's actually computed vs. deferred to M7.

**Schema:** `DcpProjection` — one per `(clubUnitId, programYearId)`, recomputed in place nightly (not append-only — it's a projection, not a fact log), `goals: Json` (`{ goalNumber, area, achievedCount, targetCount, achieved, dataSource, contributingRecordIds }[]`), `membershipQualifierMet`, `clubSuccessPlanQualifierMet`, `projectedLevel`, `computedAt`.

**Worker:** `apps/worker/src/processors/dcp-projection.processor.ts` + scheduler, same shape as M4's prospect-retention job, nightly at 03:00.

**API:** `GET /clubs/:clubUnitId/dcp-projection` (read-only — the worker is the only writer).

---

## Slice 4 — Club health snapshot (monthly job)

**Why:** `system-design.md` §19.4. Feeds the Area dashboard's club cards without exposing member detail.

**Schema:** `ClubHealthSnapshot` — one per `(clubUnitId, yearMonth)`, immutable once written, `meetingsHeld`, `attendanceAvg`, `memberCount`, `guestCount`, `rolesFilledPct`, `speechesGiven`.

**Worker:** `apps/worker/src/processors/club-health-snapshot.processor.ts`, monthly on the 1st.

**API:** `GET /clubs/:clubUnitId/health-snapshots`.

---

## Slice 5 — Tickets

**Why:** `system-design.md` §16.1, `FR-OVS-1`. Collaborative, not escalatory — any tagged party may resolve; role-tagging survives the 1 July handover.

**Schema:** `Ticket` (`scopeUnitId`, `title`, `body`, `severity`, `status: open|active|resolved`, `parties: Json` — person/role/unit tags), `TicketComment` (append-only), resolution fields on `Ticket` itself (`resolvedBy`, `resolvedAt`, `resolutionNote` — immutable once set; reopening creates a linked successor ticket via `reopenedFromId`, never edits the resolved one).

**API:** `GET/POST /tickets?scope=` · `GET /tickets/:id` · `POST /tickets/:id/comments` · `POST /tickets/:id/resolve` · `POST /tickets/:id/reopen`.

**Scope cut, flagged not hidden:** the `:id`-keyed routes (`GET /tickets/:id`, comments, resolve, reopen) carry no `@ResourceScope` — the decorator's `locate` resolves an _org-unit_ id into a scope path, and a ticket id isn't one, so gating them would need the guard to load the ticket first to find its `scopeUnitId`, which `ResourceGuard` can't do today (it only reads `params`/`query`, never touches a repository). They're authenticated-only for now — any logged-in principal who knows a ticket's UUID can act on it, not just its jurisdiction/party. `GET/POST /tickets?scope=` (the list/create surface, where the id in question already _is_ an org unit) is fully gated as normal. Noted here rather than silently shipped.

---

## Slice 6 — Role templates

**Why:** `area_director`/`division_director` don't exist yet — no milestone before M6 needed them.

- **`area_director`** (tier `area`, `scopeRule: self_subtree`): W on `quality.area_visit_report`, `quality.president_contact_log`, `quality.ticket`; R on `quality.dcp_projection`, `quality.health_snapshot`, `governance.club_success_plan`, club roster aggregates (`identity.role_assignment` read — already club-scoped-only today; area-tier read of it is a pre-existing gap this slice doesn't extend, since `system-design.md` §7.6 gives area tier only aggregate counts, not the roster resource itself).
- **`division_director`** (tier `division`, `scopeRule: self_subtree`): same read set as `area_director` (R on `quality.dcp_projection`, `quality.health_snapshot`, `governance.club_success_plan`, `quality.ticket` W per §7.6's Div Dir row).

**Scope cut:** the fuller §7.6 matrix (AAD-PQ/CG, ADD-PQ/CG, and the district-tier roles: Dist Dir, PQD, CGD, PRM, Admin Mgr, Finance Mgr, IPDD) is not seeded — `roadmap.md`'s M6 ship gate is specifically "an Area Director runs their year"; the district-tier roster belongs with M8's governance/oversight persona and most of their resources (district finance, PR, roster) don't exist in the schema yet either.

---

## Slice 7 — Dashboard UI

Area dashboard leads with visit compliance (per-club R1/R2 filed vs. the 75% threshold, progress bar), not attendance (`FR-OVS-6`) — club cards (members, meetings, attendance, DCP level, last contact) come second. Plus: tickets list/detail, Club Success Plan editor with goals-vs-DCP-projection side by side (`system-design.md` §13.4), visit report form (six Moments of Truth).
