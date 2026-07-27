# RBAC Design & Management

Companion to `system-design.md` §7. This is the trickiest subsystem in the platform and the one where
a wrong early decision is most expensive, so it gets its own document.

---

## 1. What kind of access control this actually is

Textbook RBAC is `user → role → permission`. That is not sufficient here, and it is worth being precise
about why, because reaching for a plain RBAC library and then bolting on the missing parts is the
common failure mode.

Four things the Toastmasters domain needs that flat RBAC does not give you:

| Requirement | Example | Flat RBAC? |
|---|---|---|
| **Role is bound to a place** | Karim is President *of Club 1234*, not "a President" | ✗ |
| **Scope inherits downward** | An Area Director sees every club under their area without enumerating them | ✗ |
| **Ownership conditions** | A member reads *their own* dues, not everyone's | ✗ |
| **Roles expire** | Every term ends 30 June | ✗ |

So the model is **scoped RBAC with ownership predicates** — sometimes called *RBAC with domains* or
*ReBAC-lite*. Formally:

```
grant = (role, scopeNode, resource, action, condition, effect)
```

The two additions to classic RBAC are `scopeNode` (hierarchical, inherited) and `condition` (a
predicate on the target row). Everything else is standard.

**What this deliberately is not:** full ABAC with arbitrary attribute expressions. Rules like "readable
on Tuesdays if the club has more than 12 members" are not expressible, and that is intentional — full
ABAC is unauditable in practice. Volunteers rotating annually need a model they can look at and
understand. The five conditions in §2.3 cover every real case in the domain.

---

## 2. The permission vocabulary

A permission is `resource.action` plus a condition. Everything else in the system is composition.

### 2.1 Resources

Namespaced by bounded context, so the vocabulary stays legible as it grows.

```
org.unit                 org.program_year        org.club_profile

identity.person          identity.membership     identity.role_assignment
identity.invitation

access.role_template     access.unit_policy      access.grant

meeting.meeting          meeting.role            meeting.speech_slot
meeting.attendance       meeting.ballot          meeting.ballot_result
meeting.checklist_run    meeting.planner

education.record         education.evaluation    education.mentorship
education.onboarding     education.path_catalog

membership.prospect      membership.health_signal
membership.retention_alert

finance.dues             finance.ledger          finance.invoice
finance.installment      finance.report

governance.excom         governance.motion       governance.minutes
governance.success_plan

operations.inventory     operations.checklist_template

library.item             library.content_plan

quality.ticket           quality.visit_report    quality.contact_log
quality.dcp              quality.health_snapshot

platform.audit           platform.settings       platform.impersonate
```

**Rule: this list is seeded reference data in a `resource_catalog` table, not a TypeScript union.** It
is what the admin UI enumerates, what the test matrix iterates, and what documentation renders from. A
resource that exists in code but not in the catalogue is unreachable by policy — which is a useful
property, because it means the catalogue is authoritative.

### 2.2 Actions

Six, fixed. Resist adding more.

| Action | Meaning |
|---|---|
| `read` | View |
| `create` | Bring into existence |
| `update` | Modify |
| `delete` | Remove (rare — most things are append-only or archived) |
| `approve` | State transition requiring authority: confirm a level, approve minutes, finalise a report, reopen a meeting |
| `export` | Bulk extraction — separated from `read` because exporting 3,000 member records is a different risk from viewing one |

`approve` being distinct from `update` is what lets a VPE *edit* a speech slot while only a VPE or
President can *approve* it. Folding approval into update collapses that distinction and you lose the
whole workflow.

### 2.3 Conditions

Five predicates. Evaluated against the target row after the scope check passes.

| Condition | Meaning | Example |
|---|---|---|
| `any` | No restriction (default) | VPE reads any meeting in their club |
| `own` | `row.personId = actor.id` | Member reads their own dues record |
| `assigned` | Actor appears in a designated field | Evaluator writes the evaluation they were assigned |
| `party` | Actor is in a participants/parties list | Ticket visibility for tagged parties |
| `published` | Row has reached a published state | Members read approved minutes, not drafts |

This is what keeps the resource list short. Without conditions you need `finance.dues.own` and
`finance.dues.all` as separate resources, and the vocabulary doubles.

---

## 3. Schema

Six tables. Postgres shown; the shape is the same in any store.

```sql
-- 1. VOCABULARY  (seeded, rarely changes)
CREATE TABLE resource_catalog (
  resource        text PRIMARY KEY,          -- 'finance.ledger'
  context         text NOT NULL,             -- 'finance'
  label           text NOT NULL,             -- 'Club ledger'
  description     text,
  allowed_actions text[] NOT NULL,           -- not every resource supports every action
  club_scoped     boolean NOT NULL DEFAULT true,
  sensitivity     text NOT NULL DEFAULT 'normal'  -- normal | sensitive | restricted
);
```

`sensitivity` earns its place: `restricted` resources (`finance.ledger`, `education.evaluation`,
`membership.health_signal`, `platform.audit`) get extra treatment — never included in a wildcard grant,
always logged on read, excluded from `support_readonly` by default. It stops "grant everything to
debug this" from quietly exposing the treasury.

```sql
-- 2. ROLE TEMPLATES  (the defaults — editable by system_admin, no deploy required)
CREATE TABLE role_template (
  role        text PRIMARY KEY,              -- 'club_vpe'
  tier        text NOT NULL,                 -- club | area | division | district | platform
  unit_types  text[] NOT NULL,               -- which OrgUnit.type this role may attach to
  scope_rule  text NOT NULL,                 -- self_unit | self_subtree
  is_singleton boolean NOT NULL DEFAULT true,
  is_system   boolean NOT NULL DEFAULT false,-- system templates: cloneable, not deletable
  label       text NOT NULL
);

CREATE TABLE role_template_grant (
  role      text REFERENCES role_template(role) ON DELETE CASCADE,
  resource  text REFERENCES resource_catalog(resource),
  action    text NOT NULL,
  condition text NOT NULL DEFAULT 'any',
  effect    text NOT NULL DEFAULT 'allow',   -- allow | deny
  fields    text[],                          -- optional field-level narrowing
  PRIMARY KEY (role, resource, action, condition)
);
```

```sql
-- 3. ASSIGNMENT  (person + role + place + term)  — from system-design §6.1
CREATE TABLE role_assignment (
  id             uuid PRIMARY KEY,
  person_id      uuid NOT NULL REFERENCES person(id),
  org_unit_id    uuid NOT NULL REFERENCES org_unit(id),
  role           text NOT NULL REFERENCES role_template(role),
  program_year_id text NOT NULL,
  term_start     date NOT NULL,
  term_end       date NOT NULL,
  status         text NOT NULL,              -- pending | active | ended | revoked
  appointed_by   uuid NOT NULL REFERENCES person(id),
  appointed_at   timestamptz NOT NULL,
  ended_reason   text
);

-- one active President per club per year, enforced by the database
CREATE UNIQUE INDEX role_singleton ON role_assignment (org_unit_id, role, program_year_id)
  WHERE status = 'active';   -- applied only to roles where role_template.is_singleton
```

```sql
-- 4. PER-UNIT OVERRIDES  (a club tightening or loosening its own defaults)
CREATE TABLE unit_policy_grant (
  id           uuid PRIMARY KEY,
  org_unit_id  uuid NOT NULL REFERENCES org_unit(id),
  subject_kind text NOT NULL,                -- 'role' | 'person'
  subject_role text,                         -- when subject_kind = 'role'
  subject_person_id uuid,                    -- when subject_kind = 'person'
  resource     text NOT NULL REFERENCES resource_catalog(resource),
  action       text NOT NULL,
  condition    text NOT NULL DEFAULT 'any',
  effect       text NOT NULL,
  created_by   uuid NOT NULL,
  created_at   timestamptz NOT NULL,
  reason       text NOT NULL,                -- REQUIRED. an override without a reason is a mystery
  expires_at   timestamptz                   -- optional; temporary grants should expire
);
```

`reason` is not optional. Two years and three Presidents later, an unexplained override is
indistinguishable from a bug, and nobody dares remove it.

```sql
-- 5. DIRECT PERSON GRANTS  (exceptions — should be rare and visible)
CREATE TABLE person_grant (
  id          uuid PRIMARY KEY,
  person_id   uuid NOT NULL REFERENCES person(id),
  org_unit_id uuid NOT NULL REFERENCES org_unit(id),
  resource    text NOT NULL,
  action      text NOT NULL,
  condition   text NOT NULL DEFAULT 'any',
  effect      text NOT NULL,
  granted_by  uuid NOT NULL,
  granted_at  timestamptz NOT NULL,
  reason      text NOT NULL,
  expires_at  timestamptz
);

-- 6. PLATFORM ROLES  (orthogonal axis)
CREATE TABLE platform_role_assignment (
  person_id   uuid NOT NULL REFERENCES person(id),
  role        text NOT NULL,                 -- system_admin | unit_admin | support_readonly
  org_unit_id uuid REFERENCES org_unit(id),  -- NULL for global roles
  granted_by  uuid NOT NULL,
  granted_at  timestamptz NOT NULL,
  expires_at  timestamptz,
  PRIMARY KEY (person_id, role, org_unit_id)
);
```

**Dashboard metric worth watching:** count of rows in `person_grant` and `unit_policy_grant`. If it
climbs steadily, the role templates are wrong and people are papering over them one exception at a
time. Exceptions should be rare; a rising count is a design signal, not a support statistic.

---

## 4. Resolution

### 4.1 The algorithm

```ts
type Decision = { allow: boolean; reason: string; matchedGrant?: Grant };

async function authorize(
  actor: Principal,
  resource: string,
  action: Action,
  target: { orgUnitId: string; orgUnitPath: string; row?: Record<string, unknown> }
): Promise<Decision> {

  // 0. break-glass — always allowed, always logged
  if (actor.platformRoles.includes("system_admin")) {
    await audit.record({ type: "admin_bypass", actor, resource, action, target });
    return { allow: true, reason: "system_admin bypass" };
  }

  // 1. resolved once per request, cached per person (§5)
  const grants = await effectiveGrants(actor.personId);

  // 2. SCOPE — hierarchical prefix match. This is the whole reason OrgUnit has a path.
  const inScope = grants.filter(g => isWithin(target.orgUnitPath, g.scopePath));

  // 3. RESOURCE + ACTION
  const candidates = inScope.filter(g => g.resource === resource && g.action === action);

  // 4. CONDITION — evaluated against the target row
  const applicable = candidates.filter(g => conditionHolds(g.condition, actor, target.row));

  // 5. DENY WINS
  const deny = applicable.find(g => g.effect === "deny");
  if (deny) return { allow: false, reason: `denied by ${deny.origin}`, matchedGrant: deny };

  const allow = applicable.find(g => g.effect === "allow");
  if (allow) return { allow: true, reason: `allowed by ${allow.origin}`, matchedGrant: allow };

  // 6. DEFAULT DENY
  return { allow: false, reason: "no matching grant" };
}

function isWithin(targetPath: string, scopePath: string): boolean {
  return targetPath === scopePath || targetPath.startsWith(scopePath + ".");
  // Postgres equivalent: target_path <@ scope_path::ltree
}

function conditionHolds(c: Condition, actor: Principal, row?: any): boolean {
  if (!row) return c === "any";                    // list endpoints: see §4.3
  switch (c) {
    case "any":       return true;
    case "own":       return row.personId === actor.personId;
    case "assigned":  return row.assignedToPersonId === actor.personId
                          || row.evaluatorPersonId === actor.personId;
    case "party":     return (row.parties ?? []).some((p: any) => p.personId === actor.personId);
    case "published": return row.publishedAt != null || row.approvedAt != null;
  }
}
```

**`reason` on every decision is not decoration.** It is what powers the access inspector (§7.3) and
what turns "why can't I see this?" from a support ticket into a self-service answer.

### 4.2 Building the effective grant set

```ts
async function effectiveGrants(personId: string): Promise<Grant[]> {
  const out: Grant[] = [];

  // (a) platform roles
  for (const pr of await platformRoles(personId)) {
    const scope = pr.orgUnitId ? await pathOf(pr.orgUnitId) : "";   // "" = global root
    out.push(...PLATFORM_TEMPLATES[pr.role].map(g => ({ ...g, scopePath: scope, origin: `platform:${pr.role}` })));
  }

  // (b) domain roles via templates
  for (const ra of await activeAssignments(personId)) {
    const tpl  = await template(ra.role);
    const unit = await unit(ra.orgUnitId);
    const scope = tpl.scopeRule === "self_subtree" ? unit.path : unit.path;   // exact vs prefix at match time
    const exact = tpl.scopeRule === "self_unit";
    out.push(...tpl.grants.map(g => ({ ...g, scopePath: scope, exactOnly: exact, origin: `role:${ra.role}@${unit.name}` })));
  }

  // (c) unit policy overrides — apply to the unit itself
  for (const ov of await unitOverridesFor(personId)) {
    out.push({ ...ov, origin: `policy:${ov.orgUnitId}` });
  }

  // (d) direct person grants
  for (const pg of await personGrants(personId)) {
    out.push({ ...pg, origin: `direct:${pg.reason}` });
  }

  return out;
}
```

Note the `exactOnly` flag: `self_unit` roles must match the target unit exactly, not its descendants.
A club Treasurer's grants apply to their club, not to anything nested beneath it. Without this flag a
`self_unit` role silently behaves like `self_subtree` the moment a club gains a child node.

### 4.3 List endpoints — the part people get wrong

Row-level conditions cannot be evaluated one row at a time on a list of 500. Push them into the query:

```ts
function scopeFilter(actor: Principal, resource: string, action: Action) {
  const grants = actor.grants.filter(g => g.resource === resource && g.action === action && g.effect === "allow");
  if (!grants.length) return sql`false`;                        // default deny → empty list

  const clauses = grants.map(g => {
    const scope = sql`org_unit_path <@ ${g.scopePath}::ltree`;
    switch (g.condition) {
      case "any":       return scope;
      case "own":       return sql`${scope} AND person_id = ${actor.personId}`;
      case "assigned":  return sql`${scope} AND assigned_to_person_id = ${actor.personId}`;
      case "party":     return sql`${scope} AND ${actor.personId} = ANY(party_person_ids)`;
      case "published": return sql`${scope} AND published_at IS NOT NULL`;
    }
  });
  return sql.join(clauses, sql` OR `);
}
```

Deny grants are subtracted as `AND NOT (...)` clauses. **Filter, never post-filter** — fetching rows
and discarding them leaks through pagination counts, and it is a performance trap besides.

---

## 5. Caching and invalidation

Resolution touches five tables. Doing it per request per check is untenable.

| Layer | TTL | Keyed by |
|---|---|---|
| Request-local memo | request | `(resource, action, orgUnitId)` |
| Resolved grant set | 5 min | `personId:permissionVersion` |
| Role templates | 1 hour | global, flushed on template edit |
| OrgUnit paths | 1 hour | `orgUnitId`, flushed on reparent |

**Invalidation is a version counter, not cache eviction.** `person.permission_version` is bumped on:

- role assignment created, ended or revoked
- unit policy change touching that person or their roles
- direct grant added or expired
- role template edited → bump **every** person holding that role
- org unit reparented → bump everyone with a grant under either path
- program year rollover → bump everyone

The session JWT carries `v`. If `v` ≠ current `permission_version`, the resolved set is rebuilt and the
token reissued. **This is what lets a President appoint a VPE and have it take effect without the VPE
logging out** — worth the complexity, because "log out and back in" is the kind of instruction
volunteers ignore and then report as a bug.

---

## 6. Who manages what

The most common RBAC failure is not a bad model. It is that nobody owns it and it drifts.

| Layer | Owner | Change frequency | Mechanism |
|---|---|---|---|
| Resource catalogue | Engineering | Per release | Migration + seed |
| Role templates | System administrator | Rarely — a few times a year | Admin UI, versioned, audited |
| Role assignments | Officers, within their own authority | Every July, plus mid-year changes | Normal app workflow |
| Unit policy overrides | `unit_admin` of that unit | Occasional | Admin UI, reason required |
| Direct person grants | System administrator | Should approach zero | Admin UI, reason + expiry required |
| Platform roles | System administrator | Very rarely | Admin UI, MFA required |

**Three rules that keep it from drifting:**

1. **Nobody edits grants in the production database.** Every change goes through an audited surface. A
   hand-edited row has no `reason`, no actor, and no audit event, and it will outlive everyone's memory
   of why it exists.
2. **Every override needs a reason and, where possible, an expiry.** Temporary access that never
   expires is permanent access nobody decided to give.
3. **Templates are the fix, overrides are the workaround.** If three clubs override the same thing, the
   template is wrong. Fix the template, delete the overrides.

---

## 7. Management surfaces

Three screens. The third is the one teams skip and then regret.

### 7.1 Role template editor

A matrix: resources down, actions across, cells cycling *allow / deny / inherit*. Filter by context.
Sensitivity-flagged resources visually marked.

Essential behaviours:
- **Diff before save.** "This affects 47 people across 12 clubs. 3 will lose access to `finance.ledger`."
- **Version history** with rollback.
- **Clone-to-customise** for system templates, which cannot be edited directly.

### 7.2 Unit policy editor

Scoped to one club. Shows the effective permission for each role — inherited value, override, and net
result side by side, so it is obvious what has been changed locally versus what came from the template.

Guardrails enforced in the UI *and* the service:
- Cannot grant what the actor does not hold (`canDelegate`).
- Cannot remove the last `unit_admin`.
- Cannot override a `restricted` resource without an explicit confirmation step.

### 7.3 Access inspector — build this early

**"Why can Karim see the ledger?"** and **"Why can't Nusrat approve minutes?"** are the two questions
you will be asked constantly. Without a tool, answering means reading five tables by hand.

Input: person, resource, action, target unit. Output: the full decision trace.

```
Karim Hossain · finance.ledger · read · Club 1234
─────────────────────────────────────────────────────────
✓ ALLOW  —  role:club_treasurer @ Club 1234

Evaluation trace:
  platform roles                       none
  role:club_member @ Club 1234         no grant for finance.ledger
  role:club_treasurer @ Club 1234      ALLOW  finance.ledger:read (any)     ← matched
  role:area_director @ Area 1          no grant for finance.ledger
  unit policy Club 1234                no override
  direct grants                        none

Scope check:  d41.divA.a1.c1234  within  d41.divA.a1.c1234   ✓
Condition:    any                                            ✓
```

Also runs in reverse — *"show everything Karim can do at Club 1234"* — which is what you want during an
access review, and *"show everyone who can read `finance.ledger` anywhere"*, which is what you want when
someone asks an uncomfortable question.

Ship this in the same milestone as the permission engine. Retrofitting it means first building the
thing that makes the engine debuggable, months after you needed it.

---

## 8. Change safety

| Control | Why |
|---|---|
| **Dry-run diff** on every template change | Shows affected people and lost access before commit |
| **Audit event** on every grant change | `access` module, with before/after diff |
| **Reason required** on overrides and direct grants | An unexplained grant is indistinguishable from a bug |
| **Expiry on temporary grants** | Temporary access that never expires is permanent |
| **Quarterly access review** | Generated report: who holds `restricted` resources, all direct grants, all overrides older than a year |
| **Alert on denial spikes** | A sudden rise usually means a template change broke something real |
| **`canDelegate` on every path** | Including invitations carrying roles — otherwise invites are an escalation route |

---

## 9. Testing

```ts
// generated from role_template × resource_catalog — the most valuable suite in the project
describe("permission matrix", () => {
  for (const role of ALL_ROLES)
    for (const resource of ALL_RESOURCES)
      for (const action of ALLOWED_ACTIONS[resource])
        it(`${role} · ${resource}:${action}`, async () => {
          const actor = await personWithRole(role, testClub);
          const d = await authorize(actor, resource, action, { orgUnitId: testClub.id, ... });
          expect(d.allow).toBe(EXPECTED[role]?.[resource]?.[action] ?? false);
        });
});
```

Plus targeted cases that catch the classes of bug this model is prone to:

| Test | Catches |
|---|---|
| Sibling club isolation — every resource, every role | The core scoping bug |
| Ended role assignment grants nothing | Term expiry not honoured |
| `self_unit` role does not reach child units | The `exactOnly` bug |
| Deny in a unit policy beats an allow in a template | Precedence inverted |
| `own` condition on a list endpoint returns only own rows | Post-filtering instead of query-filtering |
| Expired direct grant is inert | Expiry not enforced at resolution |
| `canDelegate` blocks privilege escalation via invitation | The escalation path |
| Last `unit_admin` cannot be removed | Club lockout |
| `permission_version` bump takes effect without re-login | Stale cache |

---

## 10. Build or adopt

Honest comparison, since this is a real fork.

| Option | Fit | Cost |
|---|---|---|
| **Build in-DB** (this document) | Excellent. Six tables, one resolver, ~600 lines. Full control of the admin UI and access inspector | You own correctness. Needs the test matrix in §9 |
| **OpenFGA / Zanzibar** | Very good on hierarchy — relationship tuples model containment natively | A separate service to run, back up and keep consistent with your OrgUnit tree. Overkill at 3,000 users |
| **Cerbos** | Good. Policy-as-code in YAML, versioned in git, nice audit story | Policies live outside the database, so a club admin cannot edit their own overrides without a deploy — which breaks the §7.2 requirement |
| **Casbin** (`RBAC with domains`) | Reasonable. Domains map to org units | Conditions and per-unit overrides need custom matchers; you end up writing much of §4 anyway |
| **Framework-native** (NextAuth roles etc.) | Poor | Flat roles only. None of the four requirements in §1 |

**Recommendation: build it, at this scale.** The domain has an unusual shape — hierarchical scope,
annual expiry, and delegated per-unit customisation by non-technical volunteers — and every off-the-shelf
option requires bending either the tool or the requirements. Six tables and one well-tested resolver is
less work than the adaptation layer.

**Revisit if** you go multi-district with real isolation obligations (open decision 10), or if
permission checks appear in a hot path — at which point OpenFGA's caching and consistency model starts
to earn its operational cost.

---

## 11. Anti-patterns

| Anti-pattern | Why it bites | Instead |
|---|---|---|
| `user.isAdmin` boolean | Cannot express scope; multiplies into `isClubAdmin`, `isAreaAdmin`, … | Roles with scope |
| Role names hardcoded in UI (`if (role === 'club_vpe')`) | Every permission change is a deploy; overrides become impossible | Render from grants: `if (can('meeting.role','update'))` |
| Permission checks scattered through handlers | They drift; twelve subtly different versions | One `authorize()` in middleware |
| A role per club (`president_club_1234`) | Role explosion — thousands of roles | One template, N assignments |
| Post-filtering lists in application code | Leaks through pagination counts; slow | Push conditions into the query (§4.3) |
| Permissions embedded in the JWT | Cannot revoke; stale until re-login | Version counter + server-side cache (§5) |
| Wildcard grants (`finance.*`) | Silently swallows resources added later | Explicit grants; `restricted` never wildcarded |
| No expiry on "temporary" access | Becomes permanent by default | `expires_at`, required for direct grants |
| Deleting role assignments at rollover | Destroys history; "who was Treasurer in 2024?" unanswerable | `status = 'ended'` |

---

## 12. Worked examples

| Scenario | Decision | Path through the algorithm |
|---|---|---|
| VPE assigns a meeting role in their own club | **ALLOW** | `role:club_vpe@Club1234` grants `meeting.role:update` (any); scope matches exactly |
| Member reads another member's dues | **DENY** | `role:club_member` grants `finance.dues:read` with condition `own`; condition fails |
| Area Director reads a club's ledger | **DENY** | Scope matches (area path prefixes club path) but no `area_director` grant exists for `finance.ledger` |
| Area Director reads club DCP projection | **ALLOW** | `role:area_director@Area1` with `scopeRule: self_subtree`; `quality.dcp:read` granted |
| Club Coach reads club education aggregates | **ALLOW** | Club-scoped `role:club_coach@Club3010`, despite no membership in that club |
| Club Coach reads that club's ledger | **DENY** | No `finance.ledger` grant on the coach template — deliberate |
| Treasurer of Club A reads Club B's ledger | **DENY** | Scope check fails: `…c1234` is not within `…c9999` |
| Member reads draft minutes | **DENY** | Grant carries condition `published`; `approvedAt` is null |
| Guest opens a timer link | **N/A** | Not RBAC — capability token, checked separately |
| President grants themselves `platform.audit` at district | **DENY** | `canDelegate` fails: they do not hold it at district scope |
| Ended VPE (term over) opens the agenda editor | **DENY** | `effectiveGrants` only reads `status = 'active'` assignments |
| Club Admin hides the ledger from the SAA | **ALLOW** | `unit_policy_grant` deny on `finance.ledger:read` for `club_saa`; deny wins |
| Same admin tries to hide it from themselves, last admin | **DENY** | `canDelegate` guard: cannot remove the last `unit_admin` |
