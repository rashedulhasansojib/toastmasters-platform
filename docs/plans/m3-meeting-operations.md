# M3 Meeting Operations — Implementation Plan

**Goal:** Run a real club meeting end to end. `roadmap.md` §5's ship gate: "Run a real club meeting on the portal; a wifi drop mid-meeting loses no timing."

**Architecture:** Builds on M1's bare `Meeting` record (Slice 9 — "deliberately bare... a record to hang authorization on, not meeting operations"). M3 adds the real aggregate underneath it: agenda items, roles-as-entities, speech slots, live meeting-day tools, capability tokens, ballots, guarded close-out.

**Scope note (kept lean per current guidance — favor velocity/token budget over exhaustive per-slice documentation this milestone):** slices below get a short Why + Files + a couple of TDD-proving tests, not the exhaustive multi-section write-up M2 used. Still non-negotiable regardless: the 403/negative-scope test, real TDD (test before implementation), full gate before commit.

---

## Slice 1 — Agenda builder (ordered agenda items)

**Why:** `system-design.md` §9.1's meeting aggregate starts with `agendaItem[]`; M1 left `Meeting` with zero structure below it by design. This is the smallest real increment — extends the exact vertical-slice shape (`clubs/:clubUnitId/meetings/...`, `@ResourceScope`, club-scoped reads) M1 Slice 9 already proved, for the next resource in the same module. `prd.md` FR-MTG-1 (agenda/roles/slots builder).

**Scoping decisions:**

- **Append-only ordering, no reorder/delete in this slice.** Position is server-assigned (next integer after the current max for that meeting) — a client never supplies it. Reordering existing items is a separate, later increment.
- **`roleKey` is an optional plain string**, not a reference to a role entity — `MeetingRoleAssignment` (system-design.md §9.2) doesn't exist yet; wiring an item to a real role-as-entity is Slice 2+'s job once that model exists.
- **No service layer** — matches this module's own existing precedent (`MeetingController.findOne` already does its meeting-ownership check inline, no `meeting.service.ts` exists). `AgendaItemController` does the same: fetch the meeting, 404 if it doesn't belong to `clubUnitId`, else delegate to the repository.
- **`club_vpe` gets create+read** (matches its existing `meeting.meeting:create/update` grants — the VPE builds the agenda); **`club_president`/`club_member` get read only** (matches their existing `meeting.meeting:read`).

**Files:** `packages/db/prisma/schema.prisma` (+`AgendaItem`, +migration), `packages/db/src/seed.ts` (`meeting.agenda_item` resource + grants), `packages/contracts/src/meeting.ts` (+`agendaItem`, +`createAgendaItemRequestSchema`), `apps/api/src/modules/meeting/agenda-item.repository.ts` (new), `agenda-item.controller.ts` (new), `meeting.module.ts` (register both).

**Tests** (`apps/api/test/integration/agenda-item-http.int-spec.ts`, new): (1) a `club_vpe` creates three items, positions auto-increment 1/2/3, `GET` returns them in order; (2) a member of a **different** club is 403'd (the outer `@ResourceScope` guard — sibling-club isolation, the one non-negotiable case); (3) a valid `clubUnitId` with a `meetingId` belonging to **another** club 404s (the inner ownership check, not just the outer scope guard).

- [x] Schema + migration + seed.
- [x] Repository + controller + module wiring, TDD against the 3 tests above. Two build-vs-source gotchas hit again (`packages/db` needs rebuilding after both the migration _and_ the later `seed.ts` edit — two separate rebuilds, not one) — same class of issue as M2 Slices 5/6/7, now four times in this project. Also bumped `access.seed.int-spec.ts`'s hardcoded resource count (10→11) and added `meeting.agenda_item` to `authorization-matrix.int-spec.ts`'s `RESOURCE_ACTIONS`, per that suite's own per-slice-extension convention.
- [x] Full gate once at the end — green (352 integration, up from 328; 72 unit; lint/typecheck/build clean).
- [x] Commit: `feat(meeting): agenda builder — ordered agenda items on a meeting`

---

## Slice 2 — Dashboard: agenda page, and adopting Tailwind + shadcn/ui

**Why:** the user pointed at a prior, differently-stacked implementation of this same domain (`../toastmaster-portal`, Mongoose/MongoDB + Next.js, not this repo) with an already-built, fairly complete UI for exactly this feature set (`components/events/AgendaTab.tsx`, `EventBuilder.tsx`, `TimerReportTab.tsx`, etc.) — asked to reuse what's reusable rather than build the dashboard from a blank slate. That prior UI is Tailwind v4 + shadcn/ui (`base-nova` style, `@base-ui/react` primitives); the current dashboard is plain CSS. Ported the toolchain, not just individual components, so the rest of the old UI keeps porting cleanly later — confirmed with the user first, since adding dependencies isn't a call to make silently.

**Scoping decisions:**

- **Infra first, as its own commit** — Tailwind, shadcn config (`components.json`), theme (`globals.css`, carried over from the old repo's own file nearly verbatim), and only the shadcn primitives this slice actually uses (`button`, `input`, `label`, `textarea`, `separator`, `card`) — not the old repo's full `components/ui/` (which also has marketing-page GSAP/Three.js effects irrelevant here, and several primitives — `select`, `dialog`, `sheet` — nothing yet needs).
- **The old repo's fonts (`--font-dm-sans`/`--font-fraunces` via `next/font`) were dropped**, not ported — no font loading is wired up in this dashboard yet; Tailwind's default `font-sans` stack applies instead. A deliberate simplification, not an oversight.
- **M2 Slice 7's shell/login CSS (`.shell-header`, `.login-form`, `.page`) is untouched plain CSS**, appended after the new Tailwind theme rather than rewritten to Tailwind utility classes — that rewrite is a separate, later cleanup with no functional need attached to it right now.
- **The agenda UI itself is adapted, not copied verbatim** — the old `AgendaTab.tsx` is a rich multi-field form (meeting number, per-speaker evaluator names, etc.) backed by a much richer Mongoose schema than this project's `AgendaItem` (Slice 1: `title`, `plannedDurationSeconds`, optional `roleKey`). Built a simpler add-item form + ordered list matching what the API actually supports today, in the same shadcn visual language — not the old form's full field set, which has no backend to hold it yet.
- **New BFF pattern: `authedFetch()`**, extracted into `session-proxy.ts` from the login/switch-unit-specific logic there — the two auth routes need to _reissue_ the session cookie on success (Slice 7's `extractSessionCookie`); a plain data read/write like agenda items doesn't touch the cookie at all, just forwards it. `lib/meetings.ts` (server reads) and the new `/api/clubs/:clubUnitId/meetings/:meetingId/agenda-items` route handler (the client form's mutation target) both use this.

**Files:** `apps/dashboard/package.json` (+Tailwind/shadcn deps), `postcss.config.mjs`, `components.json` (new), `src/app/globals.css` (rewritten), `src/lib/utils.ts` (new, `cn()`), `src/components/ui/{button,input,label,textarea,separator,card}.tsx` (new, ported), `src/lib/session-proxy.ts` (+`authedFetch`/`sessionCookieHeader`, extracted from `session.ts`), `src/lib/meetings.ts` (new), `src/app/api/clubs/[clubUnitId]/meetings/[meetingId]/agenda-items/route.ts` (new), `src/components/agenda/{AddAgendaItemForm,AgendaItemsList}.tsx` (new), `src/app/clubs/[clubUnitId]/meetings/[meetingId]/page.tsx` (new).

**Verification:** same manual-curl-with-cookie-jar method Slice 7 established (no browser available in this environment) — logged in as the existing dev demo person (given a `club_vpe` role and a real meeting via a temporary, uncommitted seed script, same pattern as Slice 7's), then via the dashboard's own routes: added two agenda items (titles/durations/one with a `roleKey`), confirmed positions auto-incremented (1, 2) and the rendered page showed both correctly (title, role, minutes converted from seconds). One real friction point, not a bug: the dev Postgres already had a demo person from Slice 7, but `pnpm db:seed` hadn't been re-run since Slice 1 added `meeting.agenda_item` to `seed.ts` — re-ran it, then still hit stale `403`s until the Redis effective-grants cache (keyed by `personId:permissionVersion`, unaffected by a reference-data-only reseed) was flushed. Expected in dev; in a real deploy this doesn't recur the same way (a fresh person/session naturally gets a live resolution).

- [x] Tailwind + shadcn infra, committed alone first.
- [x] Agenda page + form + proxy route, verified against the real dev stack.
- [x] Full gate (lint/typecheck/build for dashboard; unaffected `apps/api` suites untouched by this slice).
- [x] Commit: `feat(dashboard): agenda page — the agenda builder's first real UI`

---

## Slice 3 — Meeting roles are entities, not strings

**Why:** `system-design.md` §9.2 — role assignments must reference identity (Pathways credit, rotation fairness, cross-club logging, reliable attendance), not the placeholder `roleKey` string Slice 1's `AgendaItem` carries. The `meeting.role` resource was already seeded in M1/M2 anticipating this slice (grants existed, no endpoints did) — this slice finally wires it up.

**Scoping decisions:**

- **`guest` assignee deferred.** §9.2 lists `member | cross_club | guest | unfilled`; `guest` references a `Prospect` row that doesn't exist until M4. Ships now: `member`, `cross_club`, `unfilled`.
- **No status transitions this slice.** Assignments are created `proposed` and read back; `confirm`/`decline`/`fulfil` (§9.2's `status` lifecycle) is a later increment, matching Slice 1's own "smallest real increment" precedent.
- **`roleKey` is a fixed Prisma enum**, not seeded reference data — §9.2's vocabulary (`toastmaster`, `general_evaluator`, …) is closed enough (extend via migration) that it doesn't warrant the RBAC-catalogue seeded-data treatment CLAUDE.md reserves for resources/actions/DCP goals/role templates.
- **Bug found in passing:** `club_vpe` had `update` on `meeting.role` since M2 but never `read` — added here (caught by this slice's own GET test failing 403 first).

**Files:** `packages/db/prisma/schema.prisma` (+`MeetingRoleAssignment`, +3 enums, +migration), `packages/db/src/seed.ts` (`meeting.role` gains `create` action + `club_vpe` create/read grants), `packages/contracts/src/meeting.ts` (+`meetingRoleAssignment`, `meetingRoleAssignee` discriminated union, +create request schema), `apps/api/src/modules/meeting/meeting-role-assignment.{repository,controller}.ts` (new), `meeting.module.ts` (register both).

**Tests** (`meeting-role-assignment-http.int-spec.ts`, new): (1) a `club_vpe` proposes one assignment of each supported assignee kind, `GET` returns all three as `proposed`; (2) sibling-club member 403's (non-negotiable per `CLAUDE.md`).

- [x] Schema + migration + seed.
- [x] Repository + controller + module wiring, TDD against the 2 tests above.
- [x] Bumped `authorization-matrix.int-spec.ts`'s `meeting.role` actions to include `create`.
- [x] Full gate — green (366 integration, up from 352; 72 unit; lint/typecheck/build clean).
- [x] Commit: `feat(meeting): role assignments are entities — roles reference identity, not strings`

---

## Slice 4 — Speech-slot request/approval with path validation

**Why:** `system-design.md` §9.1's `speechSlot[]` — a member requests a speech slot against a Pathways project; a VPE approves or declines it. This is the first resource to use the `approve` action (the roadmap flags `approve` as distinct from `update` specifically for this kind of workflow) and the first write path that validates against seeded reference data rather than accepting free text.

**Scoping decisions:**

- **Trimmed `PathCatalog`.** §10.1's full shape (`isVintage`, `requiredRoleKeys`, `requiresEducationSeries`, levels-with-nested-projects) is `EducationRecord`'s (M7) concern. This slice only needs `pathCode → projects[{ projectCode, level, minMinutes, maxMinutes }]` to validate a request — modeled as two flat tables (`PathwayPath`, `PathwayProject`), not the nested JSON shape. Seeded with one real path (Presentation Mastery) and two real projects (Ice Breaker, Evaluation and Feedback) — enough to prove the mechanism; extending the catalog is a seed-data edit, no migration, no deploy.
- **`level` is server-derived**, not client-supplied — taken from the matched `PathwayProject` row, same append-only-adjacent principle as Slice 1's server-assigned `position`.
- **Duration is validated against the project's `minMinutes`/`maxMinutes`** at request time (400 if out of bounds) — the one piece of real business validation in this slice, done inline in the repository (still no service layer, matching this module's precedent).
- **No catalog-listing endpoint yet** — a member needs to already know the path/project codes. Deferred until the dashboard actually needs a picker.
- **`club_vpe` decides via a single `PATCH .../approve`-scoped endpoint** taking `{ status: 'approved' | 'declined' }`, not two separate routes — same officer decision, same `approve` grant either way.

**Files:** `packages/db/prisma/schema.prisma` (+`PathwayPath`, `PathwayProject`, `SpeechSlot`, +migration), `packages/db/src/seed.ts` (`meeting.speech_slot` resource + grants, `seedPathwayCatalog()`), `packages/db/prisma/seed.ts` (calls it), `packages/contracts/src/meeting.ts` (+`speechSlot`, create/decide request schemas), `apps/api/src/modules/meeting/speech-slot.{repository,controller}.ts` (new), `meeting.module.ts` (register both).

**Tests** (`speech-slot-http.int-spec.ts`, new): (1) a member requests a valid Ice Breaker slot (level derived as 1), a VPE approves it; (2) an out-of-bounds duration 400s; (3) sibling-club member 403's (non-negotiable).

- [x] Schema + migration + seed (resource, grants, pathway catalog).
- [x] Repository + controller + module wiring, TDD against the 3 tests above.
- [x] Bumped `access.seed.int-spec.ts`'s resource count (11→12) and `authorization-matrix.int-spec.ts`'s `RESOURCE_ACTIONS`.
- [x] Full gate — green (405 integration, up from 366; 72 unit; lint/typecheck/build clean).
- [x] Commit: `feat(meeting): speech-slot request/approval with path validation`
