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

- [ ] Schema + migration + seed, one commit.
- [ ] Repository + controller + module wiring, TDD against the 3 tests above.
- [ ] Full gate once at the end.
- [ ] Commit: `feat(meeting): agenda builder — ordered agenda items on a meeting`
