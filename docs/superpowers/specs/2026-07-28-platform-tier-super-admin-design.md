# Design — Platform tier, super admin, and multi-district capability

**Date:** 2026-07-28
**Status:** Approved (design); implementation not started
**Branch:** `feat/multi-district-super-admin`
**Owner (decisions):** Rashedul Hasan

---

## 1. Summary

Add a **platform tier** above the district to the existing org tree, introduce a
**super admin** (a platform _operator_, not a Toastmasters office), and make the
deployment **multi-district-capable** via **row-level tenancy** on the single
org tree — without changing the core authorisation model.

The whole design rests on one principle already central to the system: **one
`ltree` org tree, one `authorize()` gate, scope inherits downward.** The super
admin is expressed entirely _within_ that model as a grant at a new platform
root — never as an `isAdmin` bypass.

This design does not add any new database, control plane, or cross-database
plumbing. It is deliberately the minimal shape that satisfies the three
decisions below while keeping every existing RBAC invariant intact.

---

## 2. Decisions recorded (Phase 0)

Per `roadmap.md` §7, decisions are recorded with owner + date + choice so the
"why" survives handover.

| #   | Decision                                              | Choice                                                                                                                                                                              | Date       | Owner          |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------- |
| 6   | Region tier above District?                           | **Yes** — include a `region` tier. It is an **in-tree node** under the platform root that groups districts (not a separate control-plane entity).                                   | 2026-07-28 | Rashedul Hasan |
| 10  | Single district or many; row-level vs DB-per-district | **Multi-district-capable via row-level tenancy** on one shared database and one org tree. DB-per-district was considered and rejected in favour of the org tree's built-in scoping. | 2026-07-28 | Rashedul Hasan |
| —   | Super admin                                           | **New.** A super admin (system administrator / platform operator) exists at the top with all-access, modelled as a role granted at the platform root.                               | 2026-07-28 | Rashedul Hasan |

**Reversal cost note.** Both #6 and #10 are cheap now and expensive later. The
`region`/`platform` tiers are fixed at schema-cut time because `ltree` makes
inserting a root level later a full-tree path rewrite. Row-level vs
DB-per-district is structurally free via the org tree now, operationally
expensive to retrofit (`system-design.md` §4.6, §25).

---

## 3. Context and constraints

- The platform is **volunteer-run and privacy-sensitive** (`prd.md` §1). The
  binding invariants (CLAUDE.md §1 / `roadmap.md` §2) that this design must not
  break:
  - **Never scatter an authorisation check.** Every decision flows through the
    one `authorize()` gate; deny beats allow; no `isAdmin` booleans
    (`FR-AUTHZ-5/6/8`).
  - **Restricted resources are never wildcarded.** `finance.ledger`,
    `education.evaluation`, `membership.health_signal`, and `platform.audit` are
    always logged on read and excluded from wildcard grants.
  - **Oversight sees aggregates, not individuals** (`FR-OVS-3`, principle 9).
  - **Grants are never hand-edited**; every change goes through the audited
    surface (`FR-AUTHZ-11`).
- The super admin is a **platform operator**, not an org-hierarchy office. It
  runs the software; it does **not** routinely read member data. This is the
  distinction that keeps principles 9/10 intact.
- Scope for now is **architecture-ready, build minimal**: lock the
  expensive-to-reverse structure, build only enough to stand up one district and
  one super admin so M1 (the walking skeleton) can proceed.

---

## 4. Architecture — org tree with a platform root

One database, one `ltree` tree, unchanged mechanics. Two new tiers sit above the
tiers M1 already builds:

```
platform                     ← new synthetic root (exactly one)
└── region        (r1)       ← groups districts
    └── district  (d41)      ← today's District root
        └── division (divA)
            └── area (a1)
                └── club (c7)
```

- **Multi-district** = additional sibling `region`/`district` subtrees under
  `platform`. No structural change is needed to add the Nth district.
- **Tenancy** is row-level and enforced by the existing scope model: `ltree`
  prefix match (`WHERE path <@ 'platform.r1.d41'`) plus **query-level filtering**
  by scope and condition. A district's members can never see a sibling
  district's rows because the scope prefix does not match — the same mechanism
  that already isolates sibling clubs (`FR-AUTHZ-8`).
- `authorize()`, `ResourceGuard`, `@ResourceScope`, and the grant shape
  `(role, scopeNode, resource, action, condition, effect)` are **unchanged**.
  The platform and region tiers are just more nodes in the same tree.

**Invariant preserved:** exactly one `platform` node exists. Enforced by a
partial unique index (`UNIQUE (kind) WHERE kind = 'platform'`), consistent with
the project's "enforce singletons at the DB, not in application code" rule.

---

## 5. Super admin — a role, not a bypass

- A seeded role template **`platform_super_admin`**, granted at the **`platform`
  root scope**. Because scope inherits downward, this reaches every region,
  district, and below. "Top with all access" is therefore expressed entirely
  through the one gate.
- **No `isAdmin` boolean, no `if (role === …)`** anywhere. The super admin is
  evaluated by `authorize()` exactly like every other grant. Removing the grant
  removes the access; an ended grant grants nothing (`effectiveGrants` reads
  `status = 'active'` only).
- The super admin is a distinct **system-administrator identity type**. It is a
  subject for grants like a Person, but flagged as platform-operational so the
  UI and audit can distinguish operator actions from member actions.
- **MFA is required** for the super admin (`roadmap.md` §6 — "MFA required for
  system administrators"). Login without a satisfied MFA factor yields no usable
  session.

---

## 6. The invariant guard — restricted data and break-glass

"All access" must not become a wildcard over restricted resources, or it breaks
_"restricted resources are never wildcarded"_ and principles 9/10. Resolution:

1. **Standing access excludes restricted resources.** The `platform_super_admin`
   template grants broad access to non-restricted resources (org, identity,
   access administration, config, operations, etc.) at the platform root, but
   **does not** include `finance.ledger`, `education.evaluation`,
   `membership.health_signal`, or `platform.audit`. These are never wildcarded.

2. **Restricted resources are reachable only via break-glass.** A break-glass
   action mints a **time-boxed, reason-required, MFA-gated** grant for a specific
   restricted resource (and, where applicable, a specific scope). It is a normal
   grant with an expiry — so it still flows through `authorize()` and still obeys
   deny-beats-allow.

3. **Every restricted read is logged.** Break-glass grants and every read under
   them emit an immutable audit event to `platform.audit` (actor, target,
   resource, reason, timestamp). This is the "operator does not routinely read
   member data" guarantee made observable.

4. **Default policy (approved):** the four restricted resources are
   **audited-break-glass**, i.e. the operator _can_ reach them under an explicit,
   logged, expiring grant. (A stricter "no operator access even via break-glass"
   mode was offered and not chosen; it can be applied per-resource later without
   reworking the model — such a resource simply has no break-glass grant path.)

---

## 7. Scope — build now vs deferred

**Build now (architecture-ready, minimal):**

- Schema/migration adding the `platform` and `region` tiers to the org tree,
  with the single-platform-root partial unique index.
- Seed: one platform root, one region, one district, one super-admin identity and
  its `platform_super_admin` grant at the platform root. Reference vocabularies
  (resources/actions/conditions/role templates) seeded as data, editable without
  a deploy (`FR-AUTHZ-1`).
- `authorize()` / `ResourceGuard` extended only to recognise the platform-root
  scope and the break-glass grant path (expiry + reason + MFA gate).
- Break-glass grant flow + audit emission for the four restricted resources.
- Authorisation-matrix rows for the super admin, including the negative cases.

**Deferred (not built now):**

- Multi-district management UI, tenant self-service, district lifecycle tooling.
- Cross-district dashboards / roll-ups.
- Any billing or per-tenant configuration surface.

These are deferred because the product is a single district today; the
architecture supports adding them without a structural change.

---

## 8. Data model changes (outline)

Detailed schema is produced in the implementation plan; this fixes the shape.

- **Org node kind** gains `platform` and `region` values (alongside
  `district | division | area | club`). Single-`platform` partial unique index.
- **Identity:** a system-administrator identity type/flag distinct from a
  district Person, usable as a grant subject.
- **Grant:** unchanged shape. Break-glass grants use the existing grant table
  with an **expiry** and a **required reason**, marked as break-glass so they are
  audited and excluded from ordinary role templates.
- **Audit (`platform.audit`):** append-only (DB-enforced `REVOKE UPDATE,
DELETE`), captures break-glass grant creation and every read under it.
- All org/identity/grant tables carry the tenancy scope implicitly via the tree
  path — no separate `districtId` tenancy column is introduced; the `ltree` path
  is the tenancy key.

---

## 9. Authorisation matrix and testing impact

The authorisation matrix is the single most valuable suite (`NFR-5`). This slice
extends it with:

- **Positive:** super admin at the platform root can `read` a non-restricted
  resource in a sibling district (scope inherits down).
- **Negative (the important ones):**
  - Super admin **without** an active break-glass grant is **denied** a
    restricted read (e.g. `education.evaluation`) — 403/404, not a filtered
    result.
  - An **expired** break-glass grant grants nothing.
  - A break-glass read emits a `platform.audit` row (asserted).
  - **Sibling-district isolation** still holds for ordinary roles: a district
    officer cannot see another district's rows (query-level denial).
  - Removing the super-admin grant removes all platform access (deny by default).

Per project policy: **write the 403 / wrong-scope test, not just the 200**, and
the access inspector must answer "why can this super admin see X?" as a decision
trace for the new platform tier.

---

## 10. Design-document divergences to update

This design moves off the current docs; the following are updated (or flagged
for the human to update) so the docs and code do not silently disagree
(CLAUDE.md preamble rule):

- **CLAUDE.md §1** — "single district, single deployment" → single deployment,
  **multi-district-capable** via row-level tenancy.
- **`system-design.md` §4.6 / §25** — record row-level tenancy as **chosen**
  (open decision 10 closed); note the platform/region tiers.
- **`rbac-design.md`** — add the **platform tier**, the **super-admin role**, and
  the **break-glass** model for restricted resources.
- **Phase 0 log** — decisions #6 and #10 recorded (see §2).

These doc edits are part of the implementation work, committed alongside the
schema change, not after.

---

## 11. Non-goals

- No separate control-plane database or service.
- No cross-database queries or federation.
- No `isAdmin` flag or role-name checks in application/UI code.
- No standing operator access to restricted member data (evaluations, ledger,
  health) — only audited, expiring break-glass.
- No multi-district operator tooling in this slice.

---

## 12. Open questions

None outstanding. All Phase 0 decisions that gate this design (#6, #10) and the
super-admin model are resolved above. Decisions that gate later milestones (#2
ballot anonymity, #3 club-creation authority, #5 audit retention, etc.) are out
of scope here and unaffected by this design.
