# Design — Super admin, region tier, and multi-district (canonical-aligned)

**Date:** 2026-07-28
**Status:** Approved (design); implementation planned as the M1 walking skeleton
**Branch:** `feat/multi-district-super-admin`
**Owner (decisions):** Rashedul Hasan

> **Correction note (2026-07-28).** An earlier draft of this spec invented a
> "platform root org node" and a `platform_super_admin` role template. That was
> wrong. The canonical docs (`rbac-design.md`, `system-design.md` §7,
> `prd.md` FR-AUTHZ) already specify the super admin as the **`system_admin`
> platform role** on an orthogonal global axis — not a node in the org tree.
> This version aligns to the canonical model and records the one intended
> divergence (stricter break-glass, §6).

---

## 1. Summary

Three things, all of which the canonical design already anticipates:

1. **Super admin** = the **`system_admin` platform role** (`rbac-design.md` §3
   table 6; `system-design.md` §7.7; `prd.md` actor "System Administrator").
   Global scope, full platform authority, MFA required, break-glass access to
   member data — **already specified**. We implement it; we do not invent it.
2. **Region tier** = materialise the optional `region` tier that already exists
   in `OrgUnitType` (`system-design.md` §5.1; `FR-ORG-2`).
3. **Multi-district** = **row-level tenancy**, which `system-design.md` §4.6
   delivers by adding more district roots to the one org tree (open decision 10
   → row-level).

The load-bearing principle is unchanged: **one `ltree` org tree, one
`authorize()` gate, deny wins, default deny, scope is a prefix match.** Nothing
here changes that.

---

## 2. Decisions recorded (Phase 0)

Per `roadmap.md` §7 (owner + date + choice).

| #   | Decision                                              | Choice                                                                                                                                                                                                                                 | Date       | Owner          |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------- |
| 6   | Region tier above District?                           | **Yes** — materialise the `region` tier (already in `OrgUnitType`). Tree roots at `region` (or `international`); districts hang beneath.                                                                                               | 2026-07-28 | Rashedul Hasan |
| 10  | Single district or many; row-level vs DB-per-district | **Row-level tenancy** on one shared database and one org tree. Multi-district = multiple district roots under the region root. DB-per-district considered and rejected.                                                                | 2026-07-28 | Rashedul Hasan |
| —   | Super admin                                           | Implement the existing **`system_admin`** platform role.                                                                                                                                                                               | 2026-07-28 | Rashedul Hasan |
| —   | Break-glass model                                     | **Stricter than §7.7:** `system_admin` has **no standing grant** on restricted resources; it must mint a time-boxed, reason-required break-glass `person_grant` (MFA-gated) before any restricted read, which is then audited. See §6. | 2026-07-28 | Rashedul Hasan |

**Reversal-cost note.** The `region` root is fixed at schema-cut time (`ltree`
makes inserting a root level later a full-tree path rewrite). Row-level vs
DB-per-district is structurally free via the org tree now, expensive to retrofit
(`system-design.md` §4.6, §25).

---

## 3. The authorisation model (canonical, unchanged)

From `rbac-design.md` and `system-design.md` §7. This spec adds nothing to the
model; it lists it so the plan implements the whole thing.

- **Grant** = `(role, scopeNode, resource, action, condition, effect)`.
- **Resources** are seeded reference data in `resource_catalog` — not a code
  union (`FR-AUTHZ-1`). `sensitivity ∈ normal | sensitive | restricted`. The
  four **restricted** resources — `finance.ledger`, `education.evaluation`,
  `membership.health_signal`, `platform.audit` — are never wildcarded, always
  logged on read, excluded from `support_readonly` (`FR-AUTHZ-12`).
- **Six actions** (`read create update delete approve export`), **five
  conditions** (`any own assigned party published`) — both fixed.
- **`effectiveGrants(person)`** = platform-role grants ∪ role-template grants
  (active assignments) ∪ unit-policy overrides ∪ direct person grants
  (`rbac-design.md` §4.2).
- **`authorize()`**: filter by scope prefix, then resource+action, then
  condition; **deny wins**, else allow, else **default deny** (§4.1).
- **Scope** is a prefix test on the materialised `ltree` path (§5.1). List
  endpoints **filter in the query** (`path <@ scope::ltree`), never post-filter
  (`FR-AUTHZ-8`, §4.3).
- **`scopeRule`**: `self_unit` (exact node only — the `exactOnly` flag) vs
  `self_subtree` (node + descendants).
- **`permission_version`**: permissions are never embedded in the JWT; the
  session carries a version counter `v`; a grant change bumps
  `person.permission_version`; a mismatch rebuilds the resolved set and reissues
  the token — revocation without re-login (`rbac-design.md` §5;
  `system-design.md` §6.5).
- **`canDelegate`**: an actor may only grant what it already holds at the target
  scope, and may never remove the last `unit_admin` — guards every grant path,
  including invitations (`rbac-design.md` §7.4/§8; `FR-AUTHZ-9`).
- **Access inspector**: every decision carries a human-readable `reason`; the
  system answers "what can X do here / why can X see this / who can see this
  resource" — and it ships **with** the engine (`FR-AUTHZ-7`; `rbac-design.md`
  §7.3).

---

## 4. Org tree with the region tier

One database, one `ltree` tree (`system-design.md` §5.1), rooted at `region`:

```
region        (r1)           ← root for this deployment
└── district  (d41)
    └── division (divA)
        └── area (a1)
            └── club (c1234)
```

- `OrgUnit.type ∈ international | region | district | division | area | club`
  (already defined). We root at `region`; `international` remains available above
  it without a schema change if ever needed.
- **Multi-district (row-level)** = additional `district` subtrees under the
  `region` root (`system-design.md` §4.6). A `region_advisor` domain role
  (already in the taxonomy, gated on decision 6) may be seeded later; not
  required for M1.
- Tenancy isolation is the existing scope model: prefix match + query-level
  filtering + default deny. Sibling districts cannot see each other's rows.
- Path maintenance is **transactional** on create/re-parent, emitting
  `OrgUnitReparented` and invalidating permission caches under both paths (§5.1).

---

## 5. Super admin = `system_admin` platform role

- Stored as a **`platform_role_assignment`** row (`rbac-design.md` §3 table 6):
  `role = 'system_admin'`, `org_unit_id = NULL` (global). It is an **orthogonal
  axis**, resolved in `effectiveGrants` step (a) with an empty scope path (`""`)
  that prefixes every node (`rbac-design.md` §4.2).
- Authority (`system-design.md` §7.7): write the org tree, role templates, unit
  policy; appoint any role (bounded by `canDelegate`); run program-year rollover;
  impersonate (time-boxed, reason-required, banded, logged every request).
- **No `isAdmin` boolean, no role-name checks** in app/UI code — it is evaluated
  by `authorize()` like any grant (`rbac-design.md` §11).
- **MFA required** for `system_admin` (`prd.md` NFR-7). No usable session without
  a satisfied factor.
- It does **not** get write access to member/financial records (ledger,
  evaluations); those remain append-only and role-driven.

---

## 6. Restricted data — stricter break-glass (intended divergence)

`system-design.md` §7.7 gives `system_admin` an **audited read-bypass** on
restricted data (standing read, logged every time). This deployment chooses a
**stricter** model, recorded here as a deliberate divergence:

1. **No standing access.** The `system_admin` resolution grants everything
   **except** the four restricted resources. A restricted read with no
   break-glass grant is **denied**.
2. **Break-glass = an explicit, minted grant.** To read a restricted resource the
   operator mints a **`person_grant`** for that `(resource, action)` at a scope,
   with a **required reason**, a **short expiry**, and an **MFA** check. This is
   the existing direct-grant mechanism (`rbac-design.md` §3 table 5), reused —
   not a new table.
3. **Everything audited.** Minting the grant and every read under it write an
   immutable `platform.audit` event (`NFR-6`).
4. **Expiry is enforced at resolution.** `effectiveGrants` ignores expired direct
   grants (`FR-AUTHZ-10`), so the access lapses automatically.

This satisfies "operator does not routinely read member data" more tightly than
§7.7 while reusing the canonical direct-grant + audit plumbing. Trade-off: an
extra minting step versus the simpler audited-bypass. Accepted.

---

## 7. Scope of the M1 implementation

This design is implemented as the **M1 walking skeleton** (`roadmap.md` §5),
because implementing the super admin _is_ implementing the RBAC engine.

**In scope (M1):**

- Org tree (`ltree`) with the region tier + transactional path maintenance.
- `Person` · `ClubMembership` · `RoleAssignment` (status lifecycle).
- Login + session with `permission_version` (`v`) claim.
- The full RBAC engine: `resource_catalog`, `role_template`,
  `role_template_grant`, `role_assignment`, `unit_policy_grant`, `person_grant`,
  `platform_role_assignment`; `effectiveGrants`; `authorize()` (deny-wins,
  default-deny, scope prefix, conditions, `exactOnly`); `canDelegate`;
  `permission_version` bump + cache; the access inspector.
- Seeded vocabularies + role templates (as data), the `system_admin` platform
  role, and the stricter break-glass path for restricted resources.
- One meeting with one role, to exercise the gate at a real route
  (`roadmap.md` M1 ship gate).

**Deferred (post-M1):** multi-district management UI, tenant self-service,
cross-district dashboards, the rest of the domain contexts (M2+).

---

## 8. Data model (canonical tables)

Implemented per `rbac-design.md` §3 and `system-design.md` §5.1/§6.1 — not
reinvented:

- `org_unit` (ltree `path`, `type`, `parent_id`, `depth`, `status`, `timezone`),
  single-region-root and singleton-role partial unique indexes.
- `person` (`email` unique, `password_hash`, `mfa_enabled`,
  `permission_version`), `club_membership`, `role_assignment`.
- `resource_catalog`, `role_template`, `role_template_grant`, `role_assignment`,
  `unit_policy_grant`, `person_grant`, `platform_role_assignment`.
- `audit_event` (append-only; DB-enforced `REVOKE UPDATE, DELETE`), covering
  grant changes, break-glass mints, and restricted reads.

`ltree` representation and query-level `<@` filtering are settled in the M1 plan
(the plan uses a real `ltree` column so `FR-AUTHZ-8` query-level filtering — M1's
ship gate — is not deferred).

---

## 9. Testing (the authorisation matrix)

Per `rbac-design.md` §9 / `system-design.md` §23.6 — the matrix is the single
most valuable suite. This slice asserts:

- The generated `(role × resource × action × scope)` matrix from the seeded
  templates.
- `system_admin` reaches a sibling district for a non-restricted resource (200)
  **and** is **denied** a restricted read without a break-glass grant (403/404);
  after minting, the read is allowed and a `platform.audit` row is written; an
  **expired** break-glass grant is inert.
- Sibling-district / sibling-club isolation for ordinary roles (query-level
  denial, not post-filter).
- Ended assignment grants nothing; `self_unit` role does not reach a child unit;
  deny in a unit policy beats a template allow; `canDelegate` blocks escalation
  via invitation; `permission_version` bump takes effect without re-login.

Restricted resources return **404 across a scope boundary** where existence is
sensitive (`rbac-design.md`; CLAUDE.md).

---

## 10. Design-document divergences to record

Written down so docs and code do not silently disagree:

- **CLAUDE.md §1** — "single district, single deployment" → single deployment,
  **multi-district-capable** via row-level tenancy.
- **`system-design.md` §4.6 / §25** — open decision 10 closed: **row-level**.
- **`system-design.md` §7.7** — note the **stricter break-glass** divergence for
  `system_admin` restricted access (this deployment).
- **`prd.md` FR-ORG-2 / decision 6** — region tier **materialised**.
- **Phase 0 log** — decisions #6, #10 recorded (see §2).

These edits land in the same commits as the code that makes them true.

---

## 11. Non-goals

- No platform-tier org node; no `platform_super_admin` role template (both were
  the earlier mistake).
- No separate control-plane database; no DB-per-district.
- No `isAdmin` flag or role-name checks in application/UI code.
- No standing operator access to restricted member data — only minted,
  audited, expiring break-glass.
- No multi-district operator tooling in M1.

---

## 12. Open questions

None outstanding for this design. Milestone-gating decisions (#2 ballot
anonymity, #3 club-creation authority, #5 audit retention, #7 dues model, etc.)
are out of scope for M1 and unaffected.
