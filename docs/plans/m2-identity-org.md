# M2 Identity & Org — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan slice-by-slice. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a district top-down by invitation, with delegation that cannot escalate. `roadmap.md` §5's ship gate: "A district is built top-down purely by invitation; an invitation carrying a role passes the same delegation check as a direct grant."

**Architecture:** Builds directly on M1's engine — one `authorize()` gate, `effectiveGrants()`, `canDelegate()`, the `ltree` org tree, `permission_version` revocation — none of that changes in M2. This milestone adds the identity workflows around it: invitations, unit policies, permission versioning UX (session counter already exists from M1 Slice 5/8), the org tree editor, the unit switcher, `ActivityEvent` emission, and an access inspector extended to cover invitations/delegation.

**Tech Stack:** Same as M1 — NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Postgres + `ltree`, Redis/BullMQ, Zod 4, Vitest 4 + Testcontainers, Argon2id + `jose`.

> **Scope note.** M1's plan sketched its full slice roadmap before detailing
> any slice, because the whole milestone's shape was known up front. M2 is
> being scoped incrementally instead: **Slices 1–8** below are detailed and
> execution-ready — that closes out the milestone's originally-sketched
> scope (invitations, unit policies, permission versioning, org editor,
> unit switcher, `ActivityEvent`/audit emission, access inspector).

---

## Global Constraints

Unchanged from M1 (verbatim from CLAUDE.md and the design docs — see `docs/plans/m1-walking-skeleton.md`'s own Global Constraints section for the full list). Restated only where this slice leans on them directly:

- **`PrismaClient` only in `*.repository.ts`.** Business logic (the delegation check, token lifecycle, create-or-attach) lives in `*.service.ts`, Prisma-free.
- **Permission logic lives only in `common/authz` / the access module.** This slice reuses `canDelegate` and `AccessRepository.effectiveGrants`/`pathOf` as-is — no new permission primitive.
- **Validation:** every external input parsed with a Zod schema from `packages/contracts` at the boundary, strict bodies.
- **Logging:** Pino only; the raw invitation token must never be logged — only `tokenHash` is ever persisted or logged.
- **Reference data is seeded, editable without a deploy.**
- **Testing:** TDD — write the failing test **and the 403/negative-scope case** first. Real Postgres + Redis via Testcontainers; do not mock Prisma.
- **Commits:** Conventional Commits, no AI attribution anywhere. Small commits.
- **Migration-apply correction** (carried over from M1): `prisma migrate dev --create-only --name <x>` → hand-strip any spurious `DROP INDEX` on ltree-adjacent objects → `prisma migrate deploy` to apply. Never a second `migrate dev`.

---

## Slice 1 — Invitations (the mechanism + the delegation check)

**Why:** this is M2's ship-gate mechanism itself. `prd.md` FR-ACC-4/5/6/10 and `system-design.md` §6.3–§6.4 specify: new users are brought in by email invitation carrying intent (unit + role); an invitation that carries a role passes the **same delegation check** as a direct grant — invitations are never a privilege-escalation path; tokens are stored hashed, expire, are compared safely, and invitation creation is rate-limited per inviter. `rbac-design.md` §9 names the exact test this slice must pass: "`canDelegate` blocks privilege escalation via invitation."

**A real divergence found by reading the docs against what M1 actually built, closed here:** `system-design.md` §7.7's platform-role table gives `unit_admin` **"Scope: One subtree"** and **"Appoint any role: W within subtree, bounded by `canDelegate`."** M1 Slice 3 seeded `unit_admin` with `scopeRule: 'self_unit'` (exact-node-only) and zero grants — a placeholder, explicitly deferred ("Zero grants — see the Slice 3 plan's note on why these are deferred to Slices 4/6") and never actually revisited in M1, since nothing exercised it. `self_unit` is wrong for a role the design doc explicitly scopes to "one subtree": under `self_unit`, a `unit_admin` appointed at a district could not reach a single club beneath it — the opposite of "top-down district building." This slice corrects `unit_admin.scopeRule` to `self_subtree` in `seed.ts` (system-design.md §7.7) and gives it its first real grants: `identity.invitation:create` and `identity.role_assignment:create`, both at whatever unit it's appointed to — exactly "Appoint any role: W within subtree, bounded by `canDelegate`." Confirmed this does not disturb any M1-slice assertion: the authorisation-matrix suite (Slice 10) derives its expectations live from `role_template_grant` rows, and the existing sibling-club-denial cases for `unit_admin` test a club that is never inside the granted unit's subtree either way, so the exactOnly-vs-prefix distinction this fixes doesn't change their outcome.

**Scoping decisions:**

- **Invitation intent is single-role, not the full `roles: Array<...>` system-design.md §6.4 sketches.** `{orgUnitId, role, programYearId}` is enough to prove the mechanism and the delegation check — the same "bare entity, prove the gate" simplification M1 Slice 9 made for `Meeting`. Multi-role invitations are deferred to a later M2 slice if a real workflow needs them.
- **`intent.membership` (auto-creating a `ClubMembership`) is out of scope.** This slice proves role-assignment-via-invitation; membership attachment is a separate, smaller follow-up once this shape is proven.
- **Term dates are derived from the target `ProgramYear`**, not carried in the invitation. `RoleAssignment.termStart/termEnd` are non-nullable; system-design's intent shape doesn't carry them either. Accepting activates the role for the full program year the invitation names — the same default a direct appointment would need to choose anyway.
- **Routes are keyed by org-unit id, not club id** (`/v1/org-units/:orgUnitId/invitations`), unlike M1's `/clubs/:clubUnitId/...` routes — an invitation can target any tier (a district officer, not just a club officer), which is the whole point of "top-down district building." `POST` still resolves scope from a path param before touching the database, for the same query-level-denial property M1 Slice 9 established.
- **Only `unit_admin` gets `identity.invitation:create` in this slice**, not `club_president`. The ship-gate story is the top-down bootstrap (`unit_admin` inviting into a fresh subtree); `club_president` already has a working direct-appointment route from M1 Slice 9 and loses nothing by not also getting an email-invite option yet. Extending invitation-authorship to more roles is a one-line seed change for a later slice, not a reason to widen this one.
- **No revoke/list endpoints.** `InvitationStatus` keeps all four values (`pending | accepted | expired | revoked`) because that's the real lifecycle system-design.md §6.4 specifies and a later slice will need `revoked` — matching the precedent of `RoleAssignmentStatus` carrying `pending`/`revoked` since M1 Slice 2 despite `RoleAssignmentRepository.assign()` only ever writing `active`. Expiry is checked **live** at accept time (`expiresAt < now`), not swept by a job — no cron in this slice.
- **Token hashing, not `timingSafeEqual`.** The raw token is 256 bits of `crypto.randomBytes`, hashed with SHA-256, and looked up by unique-indexed equality — the same pattern behind `has_secure_token`-style implementations elsewhere. There is no secret being compared in application code once the token is that high-entropy and looked up by hash, so a `timingSafeEqual` step would guard a channel that isn't actually there. FR-ACC-10's "compared in constant time" intent is met by never doing a linear/branching comparison against a stored secret at all.
- **Rate limiting is a flat daily cap per inviter** (20/day), Redis `INCR`+`EXPIRE`, no configurability. FR-ACC-10 names the requirement but no design doc gives a number or window — a flat, hardcoded cap satisfies the requirement without inventing config surface nothing yet needs.
- **The escalation test is engineered with a `UnitPolicyGrant`, not two seeded roles.** `unit_admin` holds both `identity.invitation:create` and `identity.role_assignment:create` together in this slice's seed, which makes the _inner_ `canDelegate` check inside `InvitationService` tautological against the seed alone — the outer `@ResourceScope` guard would already deny anyone who lacks `identity.invitation:create`. To prove the inner check is load-bearing (not redundant with the outer guard), the test grants a `club_member` a `UnitPolicyGrant` override of `identity.invitation:create` **only** (no `identity.role_assignment:create`) at a club, then asserts that an invitation attempt carrying a role is still rejected — by the service's `canDelegate` call specifically, with no `Invitation` row ever persisted. This is the real shape of the risk FR-ACC-5 names: a caller who may create invitations but shouldn't be able to smuggle a role grant through one they couldn't hand out directly.
- **`REDIS_CLIENT` is reused from `AccessModule`, not reconnected.** `AccessModule` already owns the app's one Redis connection (via its `GrantCacheService`); exporting the existing token avoids a second live connection to the same URL for what is a small counter.

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (`Invitation` model + `InvitationStatus` enum, reverse relations on `OrgUnit`/`Person`/`ProgramYear`), `packages/db/src/seed.ts` (`identity.invitation` resource; `unit_admin` scope-rule fix + grants); new migration under `packages/db/prisma/migrations/`
- Modify: `apps/api/src/modules/access/access.module.ts` (export `REDIS_CLIENT`)
- Create: `apps/api/src/modules/identity/invitation.repository.ts`, `invitation-rate-limiter.service.ts`, `invitation.service.ts`, `invitation.controller.ts`, `invitation.service.spec.ts`
- Modify: `apps/api/src/modules/identity/identity.module.ts` (import `AccessModule`, `EmailModule`; register the four new providers + controller)
- Modify: `packages/contracts/src/identity.ts` (`invitation`, `createInvitationRequestSchema`, `acceptInvitationRequestSchema`)
- Create: `apps/api/test/integration/invitation.repository.int-spec.ts`, `invitation-http.int-spec.ts`
- Modify: `apps/api/test/integration/authorization-matrix.int-spec.ts` (add `identity.invitation` row)

**Interfaces:**

```prisma
// schema.prisma additions
enum InvitationStatus {
  pending
  accepted
  expired
  revoked
}

model Invitation {
  id               String           @id @default(uuid()) @db.Uuid
  email            String
  tokenHash        String           @unique @map("token_hash")
  orgUnitId        String           @map("org_unit_id") @db.Uuid
  orgUnit          OrgUnit          @relation(fields: [orgUnitId], references: [id])
  role             String
  programYearId    String           @map("program_year_id")
  programYear      ProgramYear      @relation(fields: [programYearId], references: [id])
  invitedBy        String           @map("invited_by") @db.Uuid
  invitedByPerson  Person           @relation("InvitationInvitedBy", fields: [invitedBy], references: [id])
  status           InvitationStatus @default(pending)
  expiresAt        DateTime         @map("expires_at")
  createdAt        DateTime         @default(now()) @map("created_at")
  acceptedAt       DateTime?        @map("accepted_at")
  acceptedPersonId String?          @map("accepted_person_id") @db.Uuid
  acceptedPerson   Person?          @relation("InvitationAcceptedBy", fields: [acceptedPersonId], references: [id])

  @@map("invitation")
}
```

```ts
// packages/contracts/src/identity.ts additions
export const invitationStatus = z.enum(['pending', 'accepted', 'expired', 'revoked']);

export const invitation = z.object({
  id: z.uuid(),
  email: z.email(),
  orgUnitId: z.uuid(),
  role: z.string().min(1),
  programYearId: z.string().min(1),
  invitedBy: z.uuid(),
  status: invitationStatus,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
  acceptedPersonId: z.uuid().nullable(),
});
// tokenHash — and the raw token — never appear here. The raw token is only ever emailed.
export type Invitation = z.infer<typeof invitation>;

export const createInvitationRequestSchema = z
  .object({ email: z.email(), role: z.string().min(1), programYearId: z.string().min(1) })
  .strict();
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const acceptInvitationRequestSchema = z
  .object({ fullName: z.string().min(1), password: z.string().min(8) })
  .strict();
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
```

```ts
// invitation.repository.ts — shape only
create(input: {
  email: string; tokenHash: string; orgUnitId: string; role: string;
  programYearId: string; invitedBy: string; expiresAt: Date;
}): Promise<Invitation>;
findByTokenHash(tokenHash: string): Promise<Invitation | null>;
/** Atomic: re-validates status/expiry, creates-or-attaches the Person, sets
 *  credentials only if none held, creates the RoleAssignment, bumps
 *  permission_version, marks the invitation accepted. */
accept(input: {
  tokenHash: string; fullName: string; passwordHash: string;
  termStart: Date; termEnd: Date;
}): Promise<{ personId: string }>;
```

```ts
// invitation.service.ts — shape only
create(input: {
  actorId: string; orgUnitId: string; email: string; role: string; programYearId: string;
}): Promise<Invitation>; // rate-limits, canDelegate-checks, mints + emails the token
accept(rawToken: string, input: { fullName: string; password: string }): Promise<{ personId: string }>;
```

**TDD steps:**

- [x] **Step 1: Schema, seed, migration**

  Red — extend `access.seed.int-spec.ts`: `identity.invitation`'s `allowedActions` includes `create`; `unit_admin`'s grants include `{resource:'identity.invitation', action:'create'}` and `{resource:'identity.role_assignment', action:'create'}`; `unit_admin`'s `role_template.scope_rule` is `'self_subtree'`.

  Green — add the `Invitation` model + `InvitationStatus` enum (above) plus reverse relations (`OrgUnit.invitations`, `Person.invitationsSent`/`invitationsAccepted`, `ProgramYear.invitations`); in `seed.ts`, add to `RESOURCES`:

  ```ts
  {
    resource: 'identity.invitation',
    context: 'identity',
    label: 'Invitation',
    allowedActions: ['create'],
    clubScoped: false, // an invitation can target any org-unit tier, not just clubs
    sensitivity: 'normal',
  },
  ```

  and change `unit_admin`'s template entry:

  ```ts
  {
    role: 'unit_admin',
    tier: 'platform',
    unitTypes: [],
    scopeRule: 'self_subtree', // system-design.md §7.7: "Scope: One subtree" — was 'self_unit', unexercised until now
    isSingleton: false,
    label: 'Unit Administrator',
    grants: [
      { resource: 'identity.invitation', action: 'create' },
      { resource: 'identity.role_assignment', action: 'create' },
    ],
  },
  ```

  `prisma migrate dev --create-only --name invitation`, hand-review (strip any spurious ltree `DROP INDEX`), `prisma migrate deploy`.

  Rerun — green. Also rerun `authorization-matrix.int-spec.ts` unchanged to confirm the `unit_admin` scope-rule fix doesn't flip any existing case (see the divergence note above for why it shouldn't).

- [x] **Step 2: `InvitationRepository`**

  Red (`invitation.repository.int-spec.ts`): `create` persists a row with the given `tokenHash` and returns the public shape (no `tokenHash` field); `findByTokenHash` round-trips it and returns `null` for an unknown hash; `accept` — given a pending, unexpired invitation — creates a new `Person` when the email is unknown, sets `passwordHash`+`status:'active'`, creates an `active` `RoleAssignment` with the given term dates, bumps `permission_version`, and flips the invitation to `status:'accepted'` with `acceptedPersonId` set; called again with an email that already has a `Person` with a `passwordHash` set, it does **not** overwrite the existing hash (attach, not overwrite) and still creates the `RoleAssignment`; called with an expired or non-`pending` invitation, it throws (`UnauthorizedException`) and writes nothing.

  Green — plain Prisma CRUD, `@Inject(PRISMA_CLIENT)` from the start; `accept` wraps the whole read-validate-write sequence in one `db.$transaction`, re-reading the invitation by `tokenHash` inside the transaction (not trusting a pre-transaction read) exactly as sketched in the Interfaces section above.

  Rerun — green.

- [x] **Step 3: `InvitationRateLimiter`**

  Red (`invitation.service.spec.ts`, mocked `Redis`): the first 20 calls for a given inviter in a day resolve; the 21st throws `HttpException` with status 429; a call for a different inviter, or on a different day, is unaffected.

  Green:

  ```ts
  const DAILY_LIMIT = 20;
  const WINDOW_SECONDS = 24 * 60 * 60;

  @Injectable()
  export class InvitationRateLimiter {
    constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

    async checkAndIncrement(inviterId: string): Promise<void> {
      const key = `invitation:rate:${inviterId}:${new Date().toISOString().slice(0, 10)}`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, WINDOW_SECONDS);
      if (count > DAILY_LIMIT) {
        throw new HttpException('Too many invitations sent today', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }
  ```

  Rerun — green.

- [x] **Step 4: `InvitationService.create()` — the delegation check**

  Red (`invitation.service.spec.ts`, mocked `AccessRepository`/`InvitationRepository`/`EmailPort`/`InvitationRateLimiter`): an actor whose `effectiveGrants` include `identity.role_assignment:create` at a scope covering the target unit succeeds — a `create()` call reaches the repository and the email port; an actor without that grant at that scope is rejected with `ForbiddenException`, and neither the repository's `create` nor the email port's `send` is called (the delegation check runs **before** any side effect).

  Green:

  ```ts
  function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // system-design.md §6.4: 7 days

  async create(input: {
    actorId: string; orgUnitId: string; email: string; role: string; programYearId: string;
  }): Promise<Invitation> {
    await this.rateLimiter.checkAndIncrement(input.actorId);

    const [actorGrants, scope] = await Promise.all([
      this.accessRepository.effectiveGrants(input.actorId),
      this.accessRepository.pathOf(input.orgUnitId),
    ]);
    if (!canDelegate(actorGrants, { resource: 'identity.role_assignment', action: 'create', scope })) {
      throw new ForbiddenException('Cannot invite into a role you do not hold the authority to assign');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const invitation = await this.invitations.create({
      email: input.email,
      tokenHash: hashToken(rawToken),
      orgUnitId: input.orgUnitId,
      role: input.role,
      programYearId: input.programYearId,
      invitedBy: input.actorId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });

    await this.email.send({
      to: input.email,
      subject: 'You have been invited to Toastmasters Portal',
      text: `Accept your invitation: ${this.env.APP_URL}/invitations/${rawToken}/accept`,
    });

    return invitation;
  }
  ```

  Rerun — green.

- [x] **Step 5: `InvitationService.accept()`**

  Red (`invitation.service.spec.ts` addition, mocked repositories): an unknown/expired/non-pending token throws a **generic** `UnauthorizedException` (same message for all three causes — no enumeration, mirroring `AuthService.login`'s existing pattern); a valid token resolves the target `ProgramYear`'s `startsOn`/`endsOn` as `termStart`/`termEnd`, hashes the submitted password, and calls `invitations.accept()` with them.

  Green:

  ```ts
  async accept(
    rawToken: string,
    input: { fullName: string; password: string },
  ): Promise<{ personId: string }> {
    const tokenHash = hashToken(rawToken);
    const invitation = await this.invitations.findByTokenHash(tokenHash);
    if (!invitation || invitation.status !== 'pending' || new Date(invitation.expiresAt) < new Date()) {
      throw new UnauthorizedException('Invalid or expired invitation');
    }
    const programYear = await this.programYears.findById(invitation.programYearId);
    if (!programYear) throw new UnauthorizedException('Invalid or expired invitation');

    const passwordHash = await this.passwords.hash(input.password);
    return this.invitations.accept({
      tokenHash,
      fullName: input.fullName,
      passwordHash,
      termStart: new Date(programYear.startsOn),
      termEnd: new Date(programYear.endsOn),
    });
  }
  ```

  Rerun — green.

- [x] **Step 6: `InvitationController` + module wiring**

  Red — folded into Step 7's end-to-end tests (a controller-only test would just re-exercise Steps 3–5's already-green paths, per M1 Slice 9's Step 4 precedent).

  Green:

  ```ts
  @Controller()
  export class InvitationController {
    constructor(private readonly invitations: InvitationService) {}

    @Post('org-units/:orgUnitId/invitations')
    @ResourceScope('identity.invitation', 'create', { source: 'param', key: 'orgUnitId' })
    async create(
      @Param('orgUnitId', uuidPipe) orgUnitId: string,
      @CurrentUser() principal: Principal,
      @Body(new ZodValidationPipe(createInvitationRequestSchema)) body: CreateInvitationRequest,
    ): Promise<Invitation> {
      return this.invitations.create({ actorId: principal.userId, orgUnitId, ...body });
    }

    @Public()
    @Post('invitations/:token/accept')
    @HttpCode(200)
    async accept(
      @Param('token') token: string,
      @Body(new ZodValidationPipe(acceptInvitationRequestSchema)) body: AcceptInvitationRequest,
    ): Promise<{ personId: string }> {
      return this.invitations.accept(token, body);
    }
  }
  ```

  In `access.module.ts`, add `REDIS_CLIENT` to `exports`. In `identity.module.ts`, add `imports: [AccessModule, EmailModule]` and register `InvitationRepository`, `InvitationRateLimiter`, `InvitationService`, `InvitationController`.

  Rerun — green. **Rerun `identity-module-boot.int-spec.ts` unchanged** — it boots `IdentityModule` through real Nest DI with no mocks; this is the exact test that caught the two DI-boot bugs in M1 Slice 7 (an `import type`-only constructor param resolving to `Object` in Nest's reflected metadata), so it must still pass byte-for-byte with the new `AccessModule`/`EmailModule` imports and the four new providers.

  **A third DI-boot issue this same test caught live:** `InvitationService` depends on `PasswordService`, which lives in `AuthModule` — but `AuthModule` itself imports `IdentityModule`, so importing `AuthModule` back from `IdentityModule` would cycle. `PasswordService` has no injected dependencies of its own (a thin Argon2id wrapper), so the fix is registering it a second time directly in `IdentityModule`'s own `providers` — a harmless second instance, not a shared one. Confirmed by rerunning `identity-module-boot.int-spec.ts`, which failed with Nest's dependency-resolution error before this fix and passed after.

- [x] **Step 7: End-to-end HTTP tests**

  Red (`invitation-http.int-spec.ts`, real Postgres + Redis, real `AppModule`, `jose`-minted JWTs — same harness shape as `ship-gate.int-spec.ts`):

  1. Seed region → district → a fresh club with **no president yet**; current program year; a person holding `unit_admin` at the district (`grantPlatformRole`, matching `self_subtree` reach over the district and everything beneath it).
  2. `POST /v1/org-units/:clubId/invitations` as the `unit_admin`, `{email, role:'club_president', programYearId}` → **201**, response carries no `tokenHash`.
  3. Read the raw token from the console-email adapter's captured log (the harness intercepts `EMAIL_PORT` the same way M1's login tests never needed a real inbox — no new seam, `ConsoleEmailAdapter` already logs the message text containing the link).
  4. `POST /v1/invitations/:token/accept` (no auth header — `@Public()`), `{fullName, password}` → **200**; the new person can now `POST /v1/auth/login` with that email/password and receives a session.
  5. `GET`-equivalent check: the accepted person now holds an **active** `club_president` `RoleAssignment` at the club (query via `RoleAssignmentRepository.findActiveForUnit`).
  6. **Escalation denial:** a `club_member` at the same club is given a `UnitPolicyGrant` override of `identity.invitation:create` only (via `GrantAdminRepository.createUnitPolicyGrant`, no `identity.role_assignment:create`). Their `POST /v1/org-units/:clubId/invitations` with `{role:'club_vpe', ...}` → **403**, and a subsequent `findByTokenHash`-style check (or a direct row count) confirms **no `Invitation` row was created** — the delegation check runs before persistence, not after.
  7. **Expired/invalid token:** `POST /v1/invitations/does-not-exist/accept` → **401** (generic message, matching Step 5's design); an invitation whose `expiresAt` is fixture-backdated → **401**, same message.
  8. **Rate limit:** the 21st `POST .../invitations` call from the same `unit_admin` within the same UTC day → **429**.

  Green — nothing new to implement; this step verifies Steps 1–6, run for real.

  Rerun — green. Then the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm test:int`.

- [x] **Step 8: Authorisation-matrix update**

  Red — add `{ resource: 'identity.invitation', actions: ['create'] }` to `authorization-matrix.int-spec.ts`'s `RESOURCE_ACTIONS`, and add `'unit_admin'` coverage (it's already in `ROLES`/`CLUB_SCOPED_ROLES` from M1 Slice 10 — no list change needed, just the new resource row it now has a real grant for).

  Green — no production code change; the matrix is generated from `role_template_grant`, so Step 1's seed change is already reflected.

  Rerun — green, full matrix suite.

- [x] **Step 9: Commit**

```bash
git add packages/db packages/contracts/src/identity.ts apps/api/src/modules/access/access.module.ts apps/api/src/modules/identity apps/api/test/integration/invitation.repository.int-spec.ts apps/api/test/integration/invitation-http.int-spec.ts apps/api/test/integration/authorization-matrix.int-spec.ts
git commit -m "feat(identity): invitations with the delegation check — M2 slice 1"
```

---

## Slice 2 — Org tree editor (create + transactional re-parent)

**Why:** `roadmap.md` §5 names "org tree editor + transactional re-parenting" as M2 content, and `prd.md` FR-ORG-3 requires re-parenting to be "transactional and rewrites the subtree, and it invalidates affected permission caches." Slice 1 proved invitations can build a district top-down — but only into org units that already exist, all seeded directly through `OrgUnitRepository` in test fixtures. There is currently **no HTTP route of any kind for org units** (`apps/api/src/modules/org/` has a repository and a bare module, no controller). This slice closes that gap and, combined with Slice 1, lets the M2 ship gate run end to end over real HTTP with nothing seeded by hand except the one-time region root and the first `unit_admin`.

**An open Phase-0 decision this slice deliberately does not touch:** `CLAUDE.md` §2 lists decision 3 — "Club-creation authority: must a portal club map to a chartered TI club with a number?" — as **still open**, with `roadmap.md` naming this exact slice ("org tree editor") as its deadline, and `CLAUDE.md`'s own rule: "If a task seems to require one of these to be settled, it is blocked. Ask; do not guess and build." Checked whether Slice 2 actually requires an answer: the decision only gates **validation** coupling `OrgUnit(type:'club')` creation to TI-membership data (`system-design.md`'s `ClubProfile`/`charteredAt`, neither of which exist in the schema yet) — it does not gate the org-tree **mechanics** (create a node, re-parent a subtree) this slice builds. So Slice 2 is scoped to carry zero TI-mapping fields and zero club-specific validation branches — the create route accepts the same shape for every `OrgUnitType`, `club` included, with no special-casing. This doesn't presume an answer to decision 3; it just doesn't ask the question yet. Whichever way decision 3 resolves, it becomes a validation addition to this route in a later slice, not a rework of it.

**Scoping decisions:**

- **No root-creation route.** `createRoot` stays a direct-repository, ops/bootstrap-only operation — a `region` root is created exactly once per deployment (the DB enforces a singleton via `org_unit_single_region_root`), never as part of routine "building a district." Only child creation (`POST /org-units/:parentId/children`) is exposed over HTTP.
- **One route handles every tier.** `POST /org-units/:parentId/children` creates a district under a region, an area under a division, a club under a district — same shape, same guard (`org.unit:create` at the parent). Splitting by tier would just be the same code four times; the parent's own `type` plus the request body's `type` is enough for a later slice to add tier-transition validation if it turns out to be needed.
- **Read/list routes are out of scope.** The roadmap phrase is "org tree editor + transactional re-parenting" — both are writes. `findById`/`findSubtree` already exist on the repository for internal use (`AuthzService.resolveScope`, test fixtures); exposing them over HTTP is a smaller, independent follow-up slice, not a reason to widen this one.
- **Only `unit_admin` and `system_admin` get `org.unit:create`/`update`, not new domain roles.** `system-design.md` §7.6 names `area_director`/`division_director`/`district_director`/`club_growth_director` as the eventual holders of org-tree writes — but none of them are seeded yet (M1 only seeded the four club-tier domain roles plus the three platform roles). Inventing district/division/area domain roles is out of scope for an org-tree-editor slice; `unit_admin`'s existing `self_subtree` reach (system-design.md §7.7: "Org tree — W within subtree") is precedent-consistent and sufficient to prove the mechanism, matching how Slice 1 extended `unit_admin` rather than seeding new roles. `system_admin` needs no explicit grant — `AccessRepository`'s `systemAdminGrants()` already synthesises allow-everything on every non-restricted resource, and `org.unit` is normal-sensitivity.
- **Re-parent needs a delegation check on the _destination_, not just the source — a real gap the design docs leave silent.** The outer `@ResourceScope('org.unit', 'update', {source:'param', key:'orgUnitId'})` guard only checks authority over the node **being moved**. Nothing in `system-design.md`/`rbac-design.md` says whether moving a unit into a subtree the actor has no authority over should be allowed. Left unchecked, a `unit_admin` scoped to one club (a leaf, so trivially "its own subtree") could re-parent that club underneath an unrelated district — jurisdiction moved without the destination's administrator's authority ever being checked. Closed the same way Slice 1 closed the identity/role-assignment case: an inner `canDelegate` check inside `OrgUnitService.reparent()`, requiring the actor to also hold `org.unit:create` at the **destination** parent's scope (re-parenting is, from the destination's point of view, "placing a new child" — the same right creation itself requires) — mirroring `InvitationService.create()`'s outer-guard-plus-inner-`canDelegate` shape exactly.
- **The `permission_version` bump on re-parent is scoped to the moved subtree's own org units, not "everyone under the old or new path."** `rbac-design.md` §5 says "org unit reparented → bump everyone with a grant under either path" — read literally this sounds like two different sets to union. It isn't: a re-parent doesn't create or destroy any `org_unit` rows, it only rewrites the `path`/`depth`/`parent_id` of the moved node and its descendants — so "the old path's unit" and "the new path's unit" are always the _same_ row, described before and after the same transaction. The actual staleness risk is narrower still: `AccessRepository.pathOf()` (used both to resolve a request's target scope and to compute each cached `Grant`'s own `scope` field) is never itself cached — only the _list_ of a person's resolved grants is (`GrantCacheService`, 5 min TTL, keyed `personId:permissionVersion`). A grant's cached `scope` only goes stale if the org unit _that specific grant is scoped to_ had its own path rewritten — i.e., exactly the moved node and its descendants, nothing above them (an ancestor's own path is untouched by a descendant moving, so grants scoped at an ancestor are never stale; whether an ancestor-scoped grant still _covers_ the moved node is re-evaluated fresh on every `authorize()` call via a live, uncached `pathOf()` lookup, regardless of grant-list cache staleness). So the correct — not merely simpler — bump set is: every person holding a `RoleAssignment`, `PlatformRoleAssignment`, `PersonGrant`, or a person-subject `UnitPolicyGrant` whose `org_unit_id` is the moved node or one of its descendants. `OrgUnitRepository.reparent()` already computes exactly that id set (`WHERE path <@ node.path`) for the path-rewrite `UPDATE` — this slice adds `RETURNING id` and reuses it.
- **"Emit `OrgUnitReparented`" is implemented as an `AuditEvent` row, not a new event bus.** No pub/sub or domain-event infrastructure exists anywhere in the codebase (`BullMQ` is for jobs, not domain events). `AuditEvent` (M1 Slice 6) is the existing "immutable record of something that happened" primitive, already used for break-glass mints and restricted reads — a new `org_unit_reparented` `AuditEventType`, written in the same transaction as the path rewrite, satisfies "emit" in spirit without inventing infrastructure a single call site doesn't justify. `reparent()`'s new `actorId` parameter is optional (existing 2-arg call sites in `org.repository.int-spec.ts` keep compiling unchanged) — the audit row is only written when an actor is known, i.e. from the HTTP path.

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (`AuditEventType` gains `org_unit_reparented`), `packages/db/src/seed.ts` (`org.unit` resource; `unit_admin` grants `org.unit:create`/`update`); new migration
- Modify: `apps/api/src/modules/org/org.repository.ts` (`reparent()` — `RETURNING id`, permission-version bump, optional audit event), `org.module.ts` (import `AccessModule`, register the new service/controller)
- Create: `apps/api/src/modules/org/org.service.ts`, `org.controller.ts`, `org.service.spec.ts`
- Modify: `packages/contracts/src/org.ts` (`createOrgUnitChildRequestSchema`, `reparentOrgUnitRequestSchema`)
- Modify: `apps/api/test/integration/org.repository.int-spec.ts` (reparent's new bump/audit behavior); Create: `apps/api/test/integration/org-http.int-spec.ts`
- Modify: `apps/api/test/integration/authorization-matrix.int-spec.ts` (add `org.unit` row)

**Interfaces:**

```prisma
// schema.prisma — AuditEventType addition
enum AuditEventType {
  break_glass_mint
  restricted_read
  org_unit_reparented
}
```

```ts
// packages/contracts/src/org.ts additions
export const createOrgUnitChildRequestSchema = z
  .object({
    type: orgUnitType,
    name: z.string().min(1),
    code: z.string().min(1),
    timezone: z.string().min(1),
  })
  .strict();
export type CreateOrgUnitChildRequest = z.infer<typeof createOrgUnitChildRequestSchema>;

export const reparentOrgUnitRequestSchema = z.object({ newParentId: z.uuid() }).strict();
export type ReparentOrgUnitRequest = z.infer<typeof reparentOrgUnitRequestSchema>;
```

```ts
// org.repository.ts — reparent()'s new shape
reparent(nodeId: string, newParentId: string, actorId?: string): Promise<void>;
```

```ts
// org.service.ts — shape only
createChild(input: {
  parentId: string; type: OrgUnitType; name: string; code: string; timezone: string;
}): Promise<OrgUnit>;
/** canDelegate-checks org.unit:create at the *destination* before delegating to the repository. */
reparent(input: { actorId: string; orgUnitId: string; newParentId: string }): Promise<void>;
```

**TDD steps:**

- [x] **Step 1: Schema, seed, migration**

  Red — extend `access.seed.int-spec.ts`: `org.unit`'s `allowedActions` includes `create` and `update`; `unit_admin`'s grants include both.

  Green — add `org_unit_reparented` to `AuditEventType`; in `seed.ts`, add to `RESOURCES`:

  ```ts
  {
    resource: 'org.unit',
    context: 'org',
    label: 'Organisation unit',
    allowedActions: ['create', 'update'],
    clubScoped: false,
    sensitivity: 'normal',
  },
  ```

  and to `unit_admin.grants`: `{ resource: 'org.unit', action: 'create' }`, `{ resource: 'org.unit', action: 'update' }`. `prisma migrate dev --create-only --name org_unit_audit_type`, hand-review (strip any spurious ltree `DROP INDEX`), `prisma migrate deploy`.

  Rerun — green. Also rerun `authorization-matrix.int-spec.ts` unchanged.

- [x] **Step 2: `OrgUnitRepository.reparent()` — permission-version bump + audit event**

  Red (`org.repository.int-spec.ts` additions): a `club_member` holding a `RoleAssignment` at a club that gets re-parented has their `permissionVersion` incremented by exactly 1 after `reparent()`; a person with no grant anywhere in the moved subtree is untouched; calling `reparent(nodeId, newParentId)` **without** an `actorId` (the existing 2-arg call sites) still compiles and runs unchanged, and writes no `AuditEvent`; calling it **with** an `actorId` writes exactly one `AuditEvent` row with `type: 'org_unit_reparented'`, `orgUnitId` set to the moved node, and `metadata` carrying the old/new parent ids.

  Green — add `RETURNING id` to the existing path-rewrite `UPDATE` (switch `$executeRaw` to `$queryRaw<Array<{ id: string }>>`), then inside the same `$transaction`:

  ```ts
  const affectedIds = affected.map((r) => r.id);
  const [roleHolders, platformHolders, personGrantHolders, policySubjects] = await Promise.all([
    tx.roleAssignment.findMany({
      where: { orgUnitId: { in: affectedIds } },
      select: { personId: true },
    }),
    tx.platformRoleAssignment.findMany({
      where: { orgUnitId: { in: affectedIds } },
      select: { personId: true },
    }),
    tx.personGrant.findMany({
      where: { orgUnitId: { in: affectedIds } },
      select: { personId: true },
    }),
    tx.unitPolicyGrant.findMany({
      where: { orgUnitId: { in: affectedIds }, subjectKind: 'person' },
      select: { subjectPersonId: true },
    }),
  ]);
  const affectedPersonIds = [
    ...new Set([
      ...roleHolders.map((r) => r.personId),
      ...platformHolders.map((r) => r.personId),
      ...personGrantHolders.map((r) => r.personId),
      ...policySubjects.map((r) => r.subjectPersonId).filter((id): id is string => id != null),
    ]),
  ];
  if (affectedPersonIds.length > 0) {
    await tx.person.updateMany({
      where: { id: { in: affectedPersonIds } },
      data: { permissionVersion: { increment: 1 } },
    });
  }
  if (actorId) {
    await tx.auditEvent.create({
      data: {
        actorPersonId: actorId,
        type: 'org_unit_reparented',
        orgUnitId: nodeId,
        metadata: { oldParentId: node.parent_id, newParentId, oldPath: node.path, newPath },
      },
    });
  }
  ```

  Rerun — green, including all four pre-existing tests in this file **unchanged**.

- [x] **Step 3: `OrgUnitService`**

  Red (`org.service.spec.ts`, mocked `OrgUnitRepository`/`AccessRepository`): `createChild` passes straight through to the repository; `reparent` calls the repository when the actor holds `org.unit:create` at the destination's scope; `reparent` throws `ForbiddenException` — and never calls the repository — when the actor holds authority over the source but not the destination.

  Green:

  ```ts
  @Injectable()
  export class OrgUnitService {
    constructor(
      private readonly orgUnits: OrgUnitRepository,
      private readonly accessRepository: AccessRepository,
    ) {}

    async createChild(input: {
      parentId: string;
      type: OrgUnitType;
      name: string;
      code: string;
      timezone: string;
    }): Promise<OrgUnit> {
      return this.orgUnits.createChild(input);
    }

    async reparent(input: {
      actorId: string;
      orgUnitId: string;
      newParentId: string;
    }): Promise<void> {
      const [actorGrants, destinationScope] = await Promise.all([
        this.accessRepository.effectiveGrants(input.actorId),
        this.accessRepository.pathOf(input.newParentId),
      ]);
      if (
        !canDelegate(actorGrants, {
          resource: 'org.unit',
          action: 'create',
          scope: destinationScope,
        })
      ) {
        throw new ForbiddenException('Cannot reparent into a unit you do not hold authority over');
      }
      await this.orgUnits.reparent(input.orgUnitId, input.newParentId, input.actorId);
    }
  }
  ```

  Rerun — green.

- [x] **Step 4: `OrgUnitController` + module wiring**

  Red — folded into Step 5's end-to-end tests (per M1 Slice 9 Step 4 / M2 Slice 1 Step 6 precedent — a controller-only test would just re-exercise Steps 2–3's already-green paths).

  Green:

  ```ts
  @Controller()
  export class OrgUnitController {
    constructor(private readonly orgUnits: OrgUnitService) {}

    @Post('org-units/:parentId/children')
    @ResourceScope('org.unit', 'create', { source: 'param', key: 'parentId' })
    async createChild(
      @Param('parentId', uuidPipe) parentId: string,
      @Body(new ZodValidationPipe(createOrgUnitChildRequestSchema)) body: CreateOrgUnitChildRequest,
    ): Promise<OrgUnit> {
      return this.orgUnits.createChild({ parentId, ...body });
    }

    @Post('org-units/:orgUnitId/reparent')
    @ResourceScope('org.unit', 'update', { source: 'param', key: 'orgUnitId' })
    @HttpCode(200)
    async reparent(
      @Param('orgUnitId', uuidPipe) orgUnitId: string,
      @CurrentUser() principal: Principal,
      @Body(new ZodValidationPipe(reparentOrgUnitRequestSchema)) body: ReparentOrgUnitRequest,
    ): Promise<{ success: true }> {
      await this.orgUnits.reparent({
        actorId: principal.userId,
        orgUnitId,
        newParentId: body.newParentId,
      });
      return { success: true };
    }
  }
  ```

  `org.module.ts` gains `imports: [AccessModule]` and registers `OrgUnitService`, `OrgUnitController`.

  Rerun — green. **Rerun `identity-module-boot.int-spec.ts`** (extend it to also boot `OrgModule` alongside `IdentityModule`, or confirm the existing combined-boot test still covers it — it already imports both `IdentityModule`/`OrgModule` together) to catch any DI-boot cycle the same way M2 Slice 1's `PasswordService` cycle was caught.

- [x] **Step 5: End-to-end HTTP tests**

  Red (`org-http.int-spec.ts`, real Postgres + Redis, real `AppModule`, `jose`-minted JWTs):

  1. **The M2 ship gate, fully over HTTP for the first time:** seed only a region root and a `unit_admin` platform-role holder at that region (self_subtree — the one-time bootstrap this deployment does once, matching Slice 1's own "bootstrapping the first officer isn't the thing under test" precedent). `POST /v1/org-units/:regionId/children` `{type:'district', ...}` → 201; `POST /v1/org-units/:districtId/children` `{type:'club', ...}` → 201; `POST /v1/org-units/:clubId/invitations` (Slice 1's route) `{email, role:'club_president', programYearId}` → 201; accept it (Slice 1's route) → 200; the accepted person holds an active `club_president` `RoleAssignment` at the newly created club. Nothing beyond the region root and the `unit_admin` grant was seeded directly — the whole district was built through HTTP.
  2. **Destination-authority denial:** a second `unit_admin` scoped only to District A (not the region) attempts `POST /v1/org-units/:clubInDistrictA/reparent` `{newParentId: districtB}` where District B is outside their authority → 403; the club's path is unchanged afterward.
  3. **Permission-version bump on reparent:** a `club_president` at a club about to be moved — capture `permissionVersion` before; a suitably-authorized `unit_admin` (scoped at the region) reparents that club to a different district → 200; the president's `permissionVersion` in the DB has incremented.

  Green — nothing new to implement; this step verifies Steps 1–4, run for real.

  Rerun — green. Then the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm test:int`.

- [x] **Step 6: Authorisation-matrix update**

  Red — add `{ resource: 'org.unit', actions: ['create', 'update'] }` to `authorization-matrix.int-spec.ts`'s `RESOURCE_ACTIONS`.

  Green — no production code change; generated from `role_template_grant`.

  Rerun — green, full matrix suite.

- [x] **Step 7: Commit**

```bash
git add packages/db packages/contracts/src/org.ts apps/api/src/modules/org apps/api/test/integration/org.repository.int-spec.ts apps/api/test/integration/org-http.int-spec.ts apps/api/test/integration/authorization-matrix.int-spec.ts apps/api/test/integration/access.seed.int-spec.ts
git commit -m "feat(org): org tree editor — create + transactional reparent with destination delegation check"
```

---

## Slice 3 — Unit policy overrides over HTTP

**Why:** `prd.md` FR-AUTHZ-9: "A unit administrator can retune their unit's permissions, but only within the bounds of what they themselves hold, and can never remove the last unit administrator." FR-AUTHZ-10: "Per-unit overrides and direct person grants require a reason and, where temporary, an expiry; expired grants are inert at resolution." The mechanism these describe — `UnitPolicyGrant` — already exists and is already correctly _resolved_ by `evaluate()`/`authorize()` (M1 Slice 6 proved "a unit-policy deny beats a role-template allow"). What's missing is everything upstream of resolution: there is no HTTP route, and the one method that creates these rows, `GrantAdminRepository.createUnitPolicyGrant`, is explicitly documented as **"Test-fixture-level creation... not `canDelegate`-gated"** — the exact same shape of gap Slice 1 closed for invitations and Slice 2 closed for org-tree reparenting.

**A real gap this slice's own codebase flags about itself, closed here:** `createUnitPolicyGrant`'s doc comment is not just descriptive, it's a warning nobody has acted on yet — a `unit_admin` can retune a unit's permissions today via a raw repository call with **zero check that they hold what they're granting**, no `expiresAt` support at all (despite the Prisma model already having the column), and no protection against a `unit_admin` denying themselves into a corner. This slice closes all three, and reuses the exact `canDelegate`-in-a-service shape `InvitationService.create()` (Slice 1) and `OrgUnitService.reparent()` (Slice 2) already established — the third time this shape has been needed is a good sign it's the right one, not a coincidence to special-case around.

**An open design question the docs leave silent, resolved here and stated explicitly:** does creating a **deny** override require the same `canDelegate` check as an **allow** override? `system-design.md` §7.4's `canDelegate` pseudocode is effect-agnostic (it never branches on allow vs. deny), which could argue for uniform treatment. But `rbac-design.md` §7.2's guardrail list phrases the check specifically as "cannot **grant** what the actor does not hold" — not "cannot override" — and `canDelegate`'s entire stated purpose throughout both design docs is anti-**escalation**: preventing a caller from handing out access they don't have. A deny override can only _remove_ access, never grant it — it is structurally incapable of being an escalation, whoever creates it. So this slice's decision: **`canDelegate` gates `allow` overrides only; `deny` overrides bypass the holds-check** (any actor who clears the outer `@ResourceScope('access.unit_policy', 'create', ...)` guard may deny anything at their scope). The **last-unit_admin guard applies to both** — `rbac-design.md` §12's own worked example is a `unit_admin` denying _themselves_ the ledger and being blocked specifically for that reason, so the docs are explicit that denial is where this protection actually matters.

**Scoping decisions:**

- **The last-unit_admin guard is scoped narrowly to `access.unit_policy` itself, not generalized to "any resource that might strand the unit."** `system-design.md` §7.4 states the invariant generically ("the operation must not remove the last `unit_admin` from targetUnit"), but a fully general version would mean re-running `effectiveGrants()`-style resolution for every resource/action in the catalog after every policy change to prove nothing essential broke — open-ended and not what any cited example asks for. `rbac-design.md` §12's own example is a `unit_admin` denying themselves the **one specific capability this slice creates**: the ability to administer the unit's policies. So the guard here is exactly that: a `deny` override whose subject is (or resolves to) the `unit_admin` role, targeting `access.unit_policy:create` at that exact unit, is rejected if it would leave zero other `unit_admin` platform-role holders **at that exact org unit** — mirroring `revokePlatformRole`'s existing row-count check (same narrowness: it doesn't credit a `unit_admin` appointed at an ancestor whose `self_subtree` reach covers this unit, either — consistent with the codebase's one existing precedent for this invariant, not a new inconsistency).
- **Role-subject overrides only, not person-subject.** The Prisma model and `AccessInspectorRepository` already support `subjectKind: 'person'`, but `createUnitPolicyGrant` today only ever builds `subjectKind: 'role'` rows, and every existing caller uses role subjects. Person-targeted overrides ("deny this one member, specifically") are a real feature but a separate, smaller slice once this shape is proven — the same "narrower thing built, broader thing named and deferred" pattern Slice 1 used for invitation intent.
- **`access.unit_policy` is a new resource, seeded with only a `create` action.** No `read`/`list`/`revoke` routes — matching Slice 1's "no revoke/list endpoints" precedent. A unit's active overrides are inspectable today via `AccessInspectorRepository`/the access-inspector routes (M1 Slice 7); a dedicated list view is a follow-up, not a blocker.
- **Only `unit_admin` gets `access.unit_policy:create`.** Same reasoning as Slices 1–2: the district/division/area domain roles `system-design.md` §7.6 eventually names aren't seeded yet, and `unit_admin`'s `self_subtree` reach (already corrected in Slice 1) is precedent-consistent and sufficient.
- **No schema/migration this slice.** `UnitPolicyGrant` already has every column needed (`expiresAt` included) — this is a pure seed-data + application-code slice, the first of the three that doesn't touch `schema.prisma`.

**Files:**

- Modify: `packages/db/src/seed.ts` (`access.unit_policy` resource; `unit_admin` grant) — no migration needed
- Modify: `apps/api/src/modules/access/grant-admin.repository.ts` (`createUnitPolicyGrant` gains `expiresAt`, returns the mapped contract type), `access.module.ts` (register the new service/controller)
- Create: `apps/api/src/modules/access/unit-policy.service.ts`, `unit-policy.controller.ts`, `unit-policy.service.spec.ts`
- Modify: `packages/contracts/src/access.ts` (`unitPolicyGrant`, `createUnitPolicyGrantRequestSchema`)
- Modify: `apps/api/test/integration/access-delegation.int-spec.ts` (repository-level `expiresAt`/mapped-return coverage); Create: `apps/api/test/integration/unit-policy-http.int-spec.ts`
- Modify: `apps/api/test/integration/authorization-matrix.int-spec.ts` (add `access.unit_policy` row), `access.seed.int-spec.ts` (seed assertions)

**Interfaces:**

```ts
// packages/contracts/src/access.ts additions
export const unitPolicyGrant = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  subjectRole: z.string().min(1),
  resource: z.string().min(1),
  action: permissionAction,
  condition: permissionCondition,
  effect: z.enum(['allow', 'deny']),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
  reason: z.string().min(1),
  expiresAt: z.iso.datetime().nullable(),
});
export type UnitPolicyGrant = z.infer<typeof unitPolicyGrant>;

export const createUnitPolicyGrantRequestSchema = z
  .object({
    subjectRole: z.string().min(1),
    resource: z.string().min(1),
    action: permissionAction,
    effect: z.enum(['allow', 'deny']),
    reason: z.string().min(1),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();
export type CreateUnitPolicyGrantRequest = z.infer<typeof createUnitPolicyGrantRequestSchema>;
```

```ts
// grant-admin.repository.ts — createUnitPolicyGrant's new shape
createUnitPolicyGrant(input: {
  orgUnitId: string; subjectRole: string; resource: string; action: Action;
  effect: 'allow' | 'deny'; createdBy: string; reason: string; expiresAt?: Date | null;
}): Promise<UnitPolicyGrant>; // now the mapped contract type, not a raw Prisma row
```

```ts
// unit-policy.service.ts — shape only
create(input: {
  actorId: string; orgUnitId: string; subjectRole: string; resource: string;
  action: Action; effect: 'allow' | 'deny'; reason: string; expiresAt?: Date | null;
}): Promise<UnitPolicyGrant>;
```

**TDD steps:**

- [x] **Step 1: Seed — `access.unit_policy` resource + `unit_admin` grant**

  Red — extend `access.seed.int-spec.ts`: `access.unit_policy`'s `allowedActions` includes `create`; `unit_admin`'s grants include it.

  Green — in `seed.ts`, add to `RESOURCES`:

  ```ts
  {
    resource: 'access.unit_policy',
    context: 'access',
    label: 'Unit policy override',
    allowedActions: ['create'],
    clubScoped: false,
    sensitivity: 'normal',
  },
  ```

  and to `unit_admin.grants`: `{ resource: 'access.unit_policy', action: 'create' }`.

  Rerun — green. Also rerun `authorization-matrix.int-spec.ts` unchanged.

- [x] **Step 2: `GrantAdminRepository.createUnitPolicyGrant` — `expiresAt` + mapped return**

  Red (`access-delegation.int-spec.ts` addition): `createUnitPolicyGrant` accepts `expiresAt`; the returned shape carries no raw Prisma internals and its `expiresAt` round-trips as an ISO string; omitting `expiresAt` yields `null`.

  Green — add `expiresAt?: Date | null` to the input, pass through to `data`, add a `toUnitPolicyGrant()` mapper (matching every other repository's `toX()` convention) and change the return type.

  Rerun — green, including the pre-existing "a unit-policy deny beats a role-template allow" test unchanged (it never asserted on the return shape).

- [x] **Step 3: `UnitPolicyService` — the delegation check + the last-admin guard**

  Red (`unit-policy.service.spec.ts`, mocked `GrantAdminRepository`/`AccessRepository`): an `allow` override succeeds when the actor holds that `resource:action` at the target scope; an `allow` override is rejected with `ForbiddenException`, and the repository is never called, when the actor does not; a `deny` override succeeds **even when the actor holds nothing on that resource at all** (the exemption this slice decided); a `deny` override whose `subjectRole` is `unit_admin` targeting `access.unit_policy:create` is rejected when it would leave zero other `unit_admin` platform-role holders at that exact unit, and succeeds when at least one other remains; a `deny` override with any other `subjectRole`/`resource`/`action` combination is never subject to the last-admin check at all.

  Green:

  ```ts
  @Injectable()
  export class UnitPolicyService {
    constructor(
      private readonly grantAdmin: GrantAdminRepository,
      private readonly accessRepository: AccessRepository,
    ) {}

    async create(input: {
      actorId: string;
      orgUnitId: string;
      subjectRole: string;
      resource: string;
      action: Action;
      effect: 'allow' | 'deny';
      reason: string;
      expiresAt?: Date | null;
    }): Promise<UnitPolicyGrant> {
      if (input.effect === 'allow') {
        const [actorGrants, scope] = await Promise.all([
          this.accessRepository.effectiveGrants(input.actorId),
          this.accessRepository.pathOf(input.orgUnitId),
        ]);
        if (!canDelegate(actorGrants, { resource: input.resource, action: input.action, scope })) {
          throw new ForbiddenException(
            'Cannot grant what you do not hold — the override would exceed your own access',
          );
        }
      }

      if (
        input.effect === 'deny' &&
        input.subjectRole === 'unit_admin' &&
        input.resource === 'access.unit_policy' &&
        input.action === 'create'
      ) {
        const remaining = await this.grantAdmin.countActiveUnitAdmins(input.orgUnitId);
        if (remaining <= 1) {
          throw new ForbiddenException('Cannot remove the last unit_admin for this unit');
        }
      }

      return this.grantAdmin.createUnitPolicyGrant({
        orgUnitId: input.orgUnitId,
        subjectRole: input.subjectRole,
        resource: input.resource,
        action: input.action,
        effect: input.effect,
        createdBy: input.actorId,
        reason: input.reason,
        expiresAt: input.expiresAt,
      });
    }
  }
  ```

  **Caught by the lint gate, not the red/green cycle:** the first draft injected `PRISMA_CLIENT` directly into the service to run the last-admin count query — `pnpm lint`'s `no-restricted-imports` rule ("PrismaClient belongs in `*.repository.ts`") failed it immediately. Fixed by adding `GrantAdminRepository.countActiveUnitAdmins(orgUnitId)` — the same row-count query `revokePlatformRole` already runs, extracted so both call sites share it — and having the service call that instead of touching Prisma itself. A reminder that `pnpm lint` is as load-bearing a check as the tests themselves for this codebase's module boundaries.

  Rerun — green.

- [x] **Step 4: `UnitPolicyController` + module wiring**

  Red — folded into Step 5's end-to-end tests, per the established precedent.

  Green:

  ```ts
  @Controller()
  export class UnitPolicyController {
    constructor(private readonly unitPolicies: UnitPolicyService) {}

    @Post('org-units/:orgUnitId/unit-policies')
    @ResourceScope('access.unit_policy', 'create', { source: 'param', key: 'orgUnitId' })
    async create(
      @Param('orgUnitId', uuidPipe) orgUnitId: string,
      @CurrentUser() principal: Principal,
      @Body(new ZodValidationPipe(createUnitPolicyGrantRequestSchema))
      body: CreateUnitPolicyGrantRequest,
    ): Promise<UnitPolicyGrant> {
      return this.unitPolicies.create({
        actorId: principal.userId,
        orgUnitId,
        ...body,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      });
    }
  }
  ```

  `access.module.ts` gains `UnitPolicyService`, `UnitPolicyController` in its `providers`/`controllers`.

  Rerun — green. Rerun `identity-module-boot.int-spec.ts` (unaffected, but cheap insurance against a DI surprise, per the pattern that's twice caught a real cycle already).

- [x] **Step 5: End-to-end HTTP tests**

  Red (`unit-policy-http.int-spec.ts`, real Postgres + Redis, real `AppModule`, `jose`-minted JWTs):

  1. A `unit_admin` at a club creates an `allow` override for `club_member`/`meeting.meeting`/`update` (a grant the `unit_admin` itself holds via its own `self_subtree` reach synthesised the same way `system_admin`'s isn't — actually via a direct `identity.role_assignment`-adjacent capability the fixture grants them first) → 201; a subsequent `authorize()` check for a `club_member` confirms the new capability applies.
  2. **Escalation denial:** an actor who holds `access.unit_policy:create` at a club (via a crafted `UnitPolicyGrant`, same fixture technique as Slice 1's escalation test) but nothing on `finance.ledger` attempts an `allow` override granting `club_member` → `finance.ledger:read` → 403, and no `UnitPolicyGrant` row is written.
  3. **Deny needs no holds-check:** the same actor from (2), still holding nothing on `finance.ledger`, creates a `deny` override removing `club_treasurer`'s own `finance.ledger:read` → 201 — proving the exemption decided above.
  4. **Last-admin guard:** a club with exactly one `unit_admin` attempts a `deny` override of `access.unit_policy:create` for `subjectRole: 'unit_admin'` at their own club → 403; granting a second `unit_admin` at the same club and repeating the same request → 201.
  5. **Expiry is inert at resolution:** create an `allow` override with `expiresAt` in the past → 201 (creation itself isn't blocked by an already-past expiry — `notExpired()` filtering happens at _resolution_, not creation) — then confirm via `authorize()` that the expired override contributes nothing.

  Green — nothing new to implement; this step verifies Steps 1–4, run for real.

  Rerun — green. Then the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm test:int`.

- [x] **Step 6: Authorisation-matrix update**

  Red — add `{ resource: 'access.unit_policy', actions: ['create'] }` to `authorization-matrix.int-spec.ts`'s `RESOURCE_ACTIONS`.

  Green — no production code change; generated from `role_template_grant`.

  Rerun — green, full matrix suite.

- [x] **Step 7: Commit**

```bash
git add packages/db/src/seed.ts packages/contracts/src/access.ts apps/api/src/modules/access apps/api/test/integration/access-delegation.int-spec.ts apps/api/test/integration/unit-policy-http.int-spec.ts apps/api/test/integration/authorization-matrix.int-spec.ts apps/api/test/integration/access.seed.int-spec.ts
git commit -m "feat(access): unit policy overrides over HTTP — canDelegate on allow, last-admin guard on self-deny"
```

---

## Slice 4 — Access inspector coverage of the three M2 resources

**Why:** `CLAUDE.md`'s Definition of Done, for any authz-affecting slice: "the access inspector covers the new resource (`FR-AUTHZ-7`)." Slices 1–3 each added a new resource (`identity.invitation`, `org.unit`, `access.unit_policy`) to `resource_catalog` and gave roles real grants on them — and none of the three extended the inspector's test coverage to prove it. That's a real gap against this milestone's own rules, caught here rather than let it compound into Slice 5.

**The mechanism needs zero code changes — this is the reverse of Slices 1–3's shape.** Every prior slice found something the design docs specified that the code didn't yet do, and built it. Here it's the opposite: read closely, `rbac-design.md` §7.3 already specifies the inspector as generic over `(person, resource, action, target)` and `(resource, action)` — free parameters, never an enumerated resource list — and M1 Slice 7 built it exactly that way. `AccessInspectorRepository.explainAccess()`/`.whatCanDoAt()`/`.whoCanAccess()` all resolve through `AccessRepository.effectiveGrants()` and `evaluate()`/`explain()` (`common/authz/evaluate.ts`, `explain.ts`), and **neither file contains a single resource name in code** — `grantApplies()` is a pure structural comparison (`grant.resource === request.resource && ...`), `whoCanAccess()`'s Prisma queries filter by whatever `resource`/`action` strings the caller passes. The only thing that's ever resource-aware is `resource_catalog.sensitivity`, read from the seeded row itself — exactly as data-driven for the three new resources as it already is for `finance.ledger`. Confirmed by direct reading, not inferred: this is a **test-only slice**. There is no "Red" in the usual sense — the assertions below aren't proving a fix, they're proving the genericity the engine was already built with, for resources it had never actually been pointed at.

**Scoping decisions:**

- **No new production files.** `access-inspector.repository.ts`, `access-inspector.controller.ts`, `explain.ts`, `evaluate.ts` are all unmodified. If any of the new assertions below actually fail, that itself is the real finding — genericity would have quietly broken somewhere between M1 Slice 7 and now — and this slice's job would become fixing it, not just proving it. (It didn't: see Step 1.)
- **One scenario per inspector entry point, using whichever of the three resources best exercises an untested shape** — not all nine `resource × inspector-method` combinations. `org.unit` is the one resource seeded with more than one action (`create` **and** `update`) — every existing test exercises a single-action resource in isolation, so `whatCanDoAt` against `org.unit` is the one genuinely new shape worth proving, not just a repeat of the `finance.ledger` pattern with different strings.
- **HTTP coverage stays a single 200/403 pair**, matching `access-inspector-http.int-spec.ts`'s existing scope exactly — that file's whole job is proving the DI-boot + guard chain works over real HTTP, which is resource-independent; a second HTTP test using a different resource string would prove nothing the first doesn't already.

**Files:**

- Modify: `apps/api/test/integration/access-inspector.int-spec.ts` (three new scenarios — `explainAccess`/`identity.invitation`, `whatCanDoAt`/`org.unit`, `whoCanAccess`/`access.unit_policy`), `access-inspector-http.int-spec.ts` (one new HTTP scenario)

**TDD steps:**

- [x] **Step 1: `explainAccess` against `identity.invitation`**

  A `unit_admin` at a club; `explainAccess({ personId, resource: 'identity.invitation', action: 'create', scope: clubPath })` returns `allowed: true`, attributes the decision to `{ kind: 'platform', role: 'unit_admin' }` (matching Slice 1's seeded grant), and the rendered `text` contains the role name — proving `explain()`'s source-grouping and text rendering both work unmodified for a platform-role grant on a resource that didn't exist when Slice 7 built this.

  Run it. Green on the first run — no implementation step, per the "Why" above.

- [x] **Step 2: `whatCanDoAt` against `org.unit` — the multi-action shape**

  A `unit_admin` at a club; `whatCanDoAt(personId, clubPath)` contains both `{ resource: 'org.unit', action: 'create', condition: 'any' }` and `{ resource: 'org.unit', action: 'update', condition: 'any' }` — proving a single role's multiple grants on the same resource both surface, not just the first match.

  Run it. Green on the first run.

- [x] **Step 3: `whoCanAccess` against `access.unit_policy`**

  A `unit_admin` at a club, plus a `club_member` given an `access.unit_policy:create` override via `createUnitPolicyGrant` (the exact fixture shape Slice 3's own escalation test used); `whoCanAccess('access.unit_policy', 'create')` includes the `unit_admin` with `via: 'platform:unit_admin'` **and** the `club_member` with `via: 'unit_policy'` — proving the reverse query enumerates across both a platform-role source and a unit-policy-override source for a resource neither existed against before.

  **A fixture bug, not a production one:** the first attempt reused `clubId`/`clubBId` for this test's `club_member` assignment and hit `role_assignment_singleton` — that partial unique index applies to _every_ role, not just singleton ones (M1's comment on the index says Slice 3 "may relax it," never did) — so a club already holding a `club_member` from an earlier test in this file can't take a second one. Fixed by giving this test its own fresh club (`orgUnits.createChild`, `districtId` promoted to outer scope) rather than touching the index.

  Run it. Green on the first run once the fixture was fixed.

- [x] **Step 4: HTTP coverage — `who-can-access` against `identity.invitation`**

  Add one scenario to `access-inspector-http.int-spec.ts`, same shape as its existing `finance.ledger` case: a `system_admin` (holding `identity.invitation` via its non-restricted broad synthesis, no break-glass needed — `identity.invitation` is `sensitivity: 'normal'`) gets 200 from `GET /v1/access/inspector/who-can-access?resource=identity.invitation&action=create&scope=<region path>`; a plain member gets 403. (`org_unit_single_region_root` means this test reuses the first test's region root via `findByPath('r1')` rather than creating a second one.)

  Run it. Green on the first run.

- [x] **Step 5: Full gate**

  `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm test:int` — confirming the full 300+-test suite, including everything Slices 1–3 added, stays green with zero production-code diff in this slice.

- [x] **Step 6: Commit**

```bash
git add apps/api/test/integration/access-inspector.int-spec.ts apps/api/test/integration/access-inspector-http.int-spec.ts
git commit -m "test(access): inspector coverage for identity.invitation, org.unit, access.unit_policy"
```

---

## Slice 5 — Audit trail for grant mutations

**Why:** `CLAUDE.md` §1 states a non-negotiable in the same breath as "never scatter an authorisation check": **"Never hand-edit a grant. Every grant change goes through the audited surface."** `roadmap.md` §6 makes the mechanism explicit: "an **immutable audit event** with actor/target/before-after diff on every state change and every break-glass access." Today that's true for exactly one kind of state change — `mintBreakGlass` (M1 Slice 6) and `reparent` (M2 Slice 2) both write an `AuditEvent` inside their transaction. Every other grant-mutating write path writes **nothing**: `RoleAssignmentRepository.assign()` (M1's direct officer-appointment route, `IdentityController`), `RoleAssignmentRepository.end()` (unused by any route yet, but exported for one), `InvitationRepository.accept()`'s inline `RoleAssignment` creation (M2 Slice 1 — the ship-gate mechanism itself), and three of `GrantAdminRepository`'s four methods — `grantPersonGrant`, `createUnitPolicyGrant` (M2 Slice 3), `grantPlatformRole`/`revokePlatformRole` — are all silent. "Grants are never hand-edited" is trivially true (there's no admin UI that writes rows directly), but the audited-surface half of that promise is not: a grant made through the one sanctioned path today leaves the same trace as one that wasn't made at all. This closes that gap across every path identified, rather than letting it compound further into whatever M2 slice comes after this one.

**Scoping decisions:**

- **Scope is exactly the grant/role-mutation write paths named above — six methods across two repositories — not a general "audit every DB write" pass.** `CLAUDE.md`'s rule is specifically about grants; extending it to, say, `Meeting` or `Invitation.create()` (which doesn't itself change anyone's access — only `accept()` does) would be scope creep past what the non-negotiable actually says.
- **`AuditEvent`, not a new `ActivityEvent` model.** `system-design.md` §23.1 sketches a richer `ActivityEvent` shape (module, targetRef, diff, actorRoles, onBehalfOfPersonId, orgUnitPath, ip/userAgent) than the `AuditEvent` table M1 actually built (`type` enum + optional `resource`/`action`/`orgUnitId` + free-form `metadata` JSON). This plan already treats `AuditEvent` as M2's implementation of that design concept (see Slice 2's `org_unit_reparented` type). Reconciling the two shapes is a real, separate schema decision — flagged here as a known divergence, not fixed in this slice, matching the "tell the human, don't guess" protocol in `CLAUDE.md`'s header rather than silently picking a shape.
- **Six new `AuditEventType` values, one per distinct state-change kind** — `role_assignment_created`, `role_assignment_ended`, `person_grant_created`, `unit_policy_grant_created`, `platform_role_granted`, `platform_role_revoked` — matching `org_unit_reparented`'s existing one-type-per-kind granularity. No generic before/after diff payload is computed for every field; `metadata` carries whatever's useful per type, the same free-form shape `mintBreakGlass` already uses.
- **Every write happens inside the mutation's own transaction**, atomic with the state change — exactly the `mintBreakGlass`/`reparent` precedent. Three methods that don't currently use `$transaction` (`grantPersonGrant`, `createUnitPolicyGrant`, `grantPlatformRole`) gain one; `revokePlatformRole` already reads-then-writes and gains a transaction wrapping both.
- **`RoleAssignmentRepository.end()` and `GrantAdminRepository.revokePlatformRole()` both gain a required `actorId` param.** Neither currently takes one — `end()` has no HTTP caller yet at all; `revokePlatformRole()` has none either (M2 Slice 1 explicitly deferred revoke endpoints). Since both are only ever called from tests today, this is a safe signature change, not a breaking one; the three `end()` test call sites and three `revokePlatformRole()` test call sites are updated to pass an actor already in scope (the assignee's own id for self-resignation, `admin1.id` for the platform-role revoke test).
- **No new HTTP surface, no resource/action/matrix changes.** Writing an audit row isn't itself a gated capability — reading `AuditEvent` rows is already gated on `platform.audit:read`, seeded in M1 Slice 6, and unaffected by this slice.

**Files:**

- Modify: `packages/db/prisma/schema.prisma` (`AuditEventType` +6 values); new migration under `packages/db/prisma/migrations/`.
- Modify: `apps/api/src/modules/identity/role-assignment.repository.ts` (`assign` audits inside its existing tx; `end` gains `actorId`, audits inside its existing tx).
- Modify: `apps/api/src/modules/identity/invitation.repository.ts` (`accept` audits inside its existing tx, attributed to `invitation.invitedBy`).
- Modify: `apps/api/src/modules/access/grant-admin.repository.ts` (`grantPersonGrant`, `createUnitPolicyGrant`, `grantPlatformRole` each gain a `$transaction` wrapper + audit write; `revokePlatformRole` gains `actorId` + a `$transaction` wrapper + audit write).
- Modify: `apps/api/src/modules/identity/invitation.service.ts` — no change expected (it calls `this.invitations.accept(...)`, which already carries everything the audit write needs internally); confirm during implementation.
- Modify: `apps/api/test/integration/access-resolution.int-spec.ts`, `identity.repository.int-spec.ts`, `access-cache.int-spec.ts` (the three existing `.end(id, reason)` call sites, updated for the new `actorId` param).
- Modify: `apps/api/test/integration/access-delegation.int-spec.ts` (the three existing `revokePlatformRole(id)` call sites, updated for the new `actorId` param; new assertions for `grantPersonGrant`/`createUnitPolicyGrant`/`grantPlatformRole`/`revokePlatformRole` audit rows, including a no-row-written assertion on the rejected last-admin-guard case).
- Modify: `apps/api/test/integration/identity.repository.int-spec.ts` (new assertion: `assign()` writes `role_assignment_created`).
- Modify: `apps/api/test/integration/invitation.repository.int-spec.ts` (new assertion: `accept()` writes `role_assignment_created` attributed to the inviter).

**TDD steps:**

- [x] **Step 1: Schema + migration**

  Added the six `AuditEventType` values, migration `20260728124556_grant_mutation_audit_types`. The generator proposed the usual spurious `DROP INDEX` on `org_unit_path_gist`/`org_unit_path_unique`; stripped by hand and replaced with the standing NOTE, matching every prior slice. Applied via `prisma migrate deploy`.

- [x] **Step 2: `RoleAssignmentRepository.assign()` writes `role_assignment_created`**

  Implemented as planned, inside `assign()`'s existing `$transaction`.

  **A packaging gotcha, not a logic bug:** the first test run failed with `PrismaClientValidationError: Invalid value for argument type. Expected AuditEventType` even though the schema and migration were both correct — `apps/api` consumes `@toastmasters/db` as **built output** (`CLAUDE.md` §4's "Build model"), and `prisma generate` alone regenerates the client in `packages/db/src` without rebuilding `dist`. Fixed with `pnpm --filter @toastmasters/db build`. Worth remembering for every future schema-touching slice, not just this one.

- [x] **Step 3: `RoleAssignmentRepository.end()` gains `actorId`, writes `role_assignment_ended`**

  Implemented as planned. All 3 pre-existing test call sites updated to pass the assignee's own id (self-resignation, matching the existing `reason: 'resigned'` fixtures).

- [x] **Step 4: `InvitationRepository.accept()` writes `role_assignment_created`**

  Implemented as planned, attributed to `invitation.invitedBy`.

- [x] **Step 5: `GrantAdminRepository.grantPersonGrant()` writes `person_grant_created`**

  Implemented as planned. Two fixture issues surfaced and were fixed, not the mechanism: (1) the new success-path test's `club_president` collided with `role_assignment_singleton` against an earlier test's assignment at the same `clubId` — fixed with a fresh club, the same fix Slice 4 needed; (2) the test's original resource/action pick (`meeting.meeting:update`) isn't among `club_president`'s seeded grants, so `canDelegate` correctly rejected it — switched to `identity.role_assignment:create`, which `club_president` does hold, matching the "actor holds the specific thing being delegated" pattern Slice 1's own escalation test established.

- [x] **Step 6: `GrantAdminRepository.createUnitPolicyGrant()` writes `unit_policy_grant_created`**

  Implemented as planned; assertion added to the existing `createUnitPolicyGrant accepts an expiresAt` test rather than a new one, since that test already exercises the exact call this needed to check.

- [x] **Step 7: `GrantAdminRepository.grantPlatformRole()` writes `platform_role_granted`; `revokePlatformRole()` gains `actorId` and writes `platform_role_revoked`**

  Implemented as planned. One pre-existing test needed updating, not fixing: `access-break-glass.int-spec.ts`'s "denies system_admin a restricted read..." test asserted the exact set of audit-event types for an actor who, as part of its own setup, calls `grantPlatformRole` — that call now legitimately produces a `platform_role_granted` row alongside `break_glass_mint`/`restricted_read`. Updated the expected array rather than narrowing the query, since the fuller list is the more honest assertion of what actually happens.

- [x] **Step 8: Full gate**

  `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green (lint clean except the pre-existing unrelated dashboard warning; 68 unit tests; build clean). `pnpm test:int` — 318/318 (up from 317; net +1 after the two `.end()`/`.revokePlatformRole()` test call sites gained an `actorId` arg with no new `it()` blocks there, and 8 new `it()`-level and inline assertions added across 4 files).

- [x] **Step 9: Commit**

```bash
git add packages/db apps/api/src/modules/identity apps/api/src/modules/access apps/api/test
git commit -m "feat(access): audit every grant-mutating write path, not just break-glass and reparent"
```

---

## Slice 6 — Session query endpoints (`GET /me`, `GET /switchable-units`)

**Why:** `roadmap.md` §5 names the **unit switcher** as M2 content; `system-design.md` §22 specifies the dashboard shell renders "**unit switcher** (District / Division / Area / Club)." The switching _mechanism_ itself is already correct (M1 Slice 8 — `POST /v1/auth/switch-unit` reissues the session cookie with only `activeUnitId` changed, never trusts anything else from the client). What's missing is the two reads any switcher UI needs before it can render anything: **who is currently logged in** (the session cookie is httpOnly by design — no JS, including a Server Component's own fetch layer, can read its claims directly) and **which units to offer as switch targets** (no query enumerates a person's units today; `system-design.md` §20.2's aspirational `GET /me` was never built — only `/auth/login` and `/auth/switch-unit` exist). This slice is backend-only; the dashboard UI that consumes these two endpoints is Slice 7.

**Scoping decisions:**

- **Switchable units = org units where the person holds an active `RoleAssignment`, or a `PlatformRoleAssignment` with a non-null `orgUnitId`** — not a full scope-prefix walk over everything `effectiveGrants` would cover. `system-design.md` §21 is explicit that `activeUnitId` is "a UI convenience" — the switcher should offer places the person was actually appointed to, not every descendant a district-wide `unit_admin`'s scope prefix technically reaches (which could be dozens of clubs). A tree/search picker for wide subtrees is a later concern if it turns out to be needed, not assumed here.
- **`system_admin`'s platform-wide grant (`orgUnitId: null`) contributes no switchable unit.** There's no specific unit that grant is "at" — nothing to add to the list.
- **`GET /me` returns the same `SessionResponse` shape `/auth/login` and `/auth/switch-unit` already return** (`personId`, `fullName`, `activeUnitId`, `programYearId`) — no new contract type, and no cookie is reissued (a pure read).
- **No N+1 for switchable-unit resolution.** `OrgUnitRepository` gains one batch method (`findByIds`), not one `findById` call per unit.
- **Both routes live on the existing `AuthController`/`AuthService`**, not a new module — `AuthService` already composes `PersonRepository`/`OrgUnitRepository`; it gains `RoleAssignmentRepository` and `GrantAdminRepository` as two more collaborators, and `AuthModule` gains `AccessModule` to its imports (mirroring `IdentityModule`'s own precedent) to reach `GrantAdminRepository`.

**Files:**

- Modify: `packages/contracts/src/identity.ts` (`switchableUnit` schema, reusing `orgUnitType` from `org.ts`).
- Modify: `apps/api/src/modules/identity/role-assignment.repository.ts` (`findActiveOrgUnitIdsForPerson`).
- Modify: `apps/api/src/modules/access/grant-admin.repository.ts` (`findPlatformRoleOrgUnitIdsForPerson`).
- Modify: `apps/api/src/modules/org/org.repository.ts` (`findByIds`, batch).
- Modify: `apps/api/src/common/auth/auth.service.ts` (`me()`, `switchableUnits()`), `auth.controller.ts` (`GET /me`, `GET /switchable-units`), `auth.module.ts` (import `AccessModule`).

**TDD steps:**

- [x] **Step 1: `RoleAssignmentRepository.findActiveOrgUnitIdsForPerson`**

  Implemented as planned: `distinct: ['orgUnitId']` filtered on `status: 'active'`. Test covers true dedup (two active _roles_ at the same club) as well as the ended-assignment exclusion, not just the two-distinct-clubs case the plan sketched.

- [x] **Step 2: `GrantAdminRepository.findPlatformRoleOrgUnitIdsForPerson`**

  Implemented as planned.

- [x] **Step 3: `OrgUnitRepository.findByIds`**

  Implemented as planned — `WHERE id = ANY(...)`, matching the file's existing raw-SQL convention for every other query (the `ltree` `path` column means this repository never uses Prisma's query builder).

- [x] **Step 4: `AuthService.me()` and `GET /v1/auth/me`**

  Implemented as planned. `AuthModule` gained `AccessModule` to its imports (for `GrantAdminRepository`, needed by Step 5's `switchableUnits()`, added in the same pass since both land on the same constructor).

  **A repeat of Slice 5's packaging gotcha:** `pnpm typecheck` failed with "Module has no exported member `SwitchableUnit`" even though the schema was correct — `packages/contracts` is also consumed as built output, and adding a new export requires rebuilding it (`pnpm --filter @toastmasters/contracts build`), not just saving the source file. Two slices in a row now; worth internalizing as a standing step whenever a `packages/*` public surface changes, not something to rediscover each time.

  **A second instance of the `??`-vs-explicit-`null` mock bug** (first seen in Slice 1's `invitation.service.spec.ts`): `auth.service.spec.ts`'s `makeService()` used `overrides.person ?? person()`, silently replacing an explicit `person: null` override with the default — breaking the "rejects a principal whose person no longer exists" test. Fixed with the same `'person' in overrides ? overrides.person : person()` pattern used there.

- [x] **Step 5: `AuthService.switchableUnits()` and `GET /v1/auth/switchable-units`**

  Implemented as planned; the HTTP test additionally proves the negative documented in the plan's own scoping decision — a person with only a `ClubMembership` (no `RoleAssignment`) gets `[]`, confirming the endpoint doesn't fall back to membership as a source of switchable units.

- [x] **Step 6: Full gate**

  `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green (72 unit tests, up from 68). `pnpm test:int` — 324/324 (up from 320).

- [x] **Step 7: Commit**

```bash
git add packages/contracts apps/api/src/modules/identity apps/api/src/modules/access apps/api/src/modules/org apps/api/src/common/auth apps/api/test
git commit -m "feat(access): session query endpoints — GET /me and GET /switchable-units"
```

---

## Slice 7 — Dashboard shell: login + unit switcher (first frontend UI)

**Why:** `system-design.md` §22: the dashboard shell renders "**unit switcher** (District / Division / Area / Club)." Slice 6 built the two reads it needs (`GET /me`, `GET /switchable-units`); `POST /v1/auth/switch-unit` has worked since M1 Slice 8. Nothing in `apps/dashboard` consumes any of it yet — the app is still exactly the Phase-0 scaffold (`layout.tsx`, `page.tsx`, `globals.css`, `lib/api.ts`, an empty `components/`), with no routing beyond the root page and no auth of any kind. This is the first real frontend slice in the project.

**A real architecture decision, not scope creep — the cross-origin cookie problem:** the API (`localhost:4000`) and dashboard (`localhost:3000`) are different origins in dev, and `docs/deployment.md` (production topology) doesn't exist yet, so there's no answer yet to "do they share a domain in prod." An httpOnly cookie the API sets is invisible to the dashboard's own Next.js server — a Server Component reading `next/headers` `cookies()` for SSR would see nothing, because the browser only attaches a cookie to requests to the domain that set it. Resolved here with the standard **BFF (backend-for-frontend) proxy pattern**, which sidesteps the undecided prod-domain question entirely rather than presuming an answer to it: two Next.js **Route Handlers** inside `apps/dashboard` (`/api/session/login`, `/api/session/switch-unit`) call the real API server-to-server (Node process to Node process — no browser, no CORS involved), then re-mint the session cookie on the **dashboard's own origin** by extracting just the token value from the API's `Set-Cookie` response header. The browser only ever talks to the dashboard's own origin for anything session-related — matching `playwright.config.ts`'s existing `baseURL: 'http://localhost:3000'`, which already assumes exactly this shape. `CLAUDE.md`'s rule that "the browser never holds a long-lived token" holds either way — it's still only ever an httpOnly cookie, just minted by the dashboard's own route handler instead of directly by the API.

**A minimal login page is in scope, not scope creep.** A unit switcher cannot be demonstrated end-to-end without a way to log in first, and `CLAUDE.md`'s Definition of Done requires "behaviour demonstrated end-to-end," not green tests in isolation.

**Scoping decisions:**

- **Switchable units = exactly what Slice 6's endpoint returns** — no client-side re-derivation, no tree/search widget. A `&lt;select&gt;` is enough to prove the mechanism for however many units a person holds.
- **No logout route in this slice.** Not needed to demonstrate login → switch; a one-line addition later (clear the dashboard's own cookie) when something actually needs it.
- **No new UI dependency.** Plain CSS matching `globals.css`'s existing convention — `CLAUDE.md` requires asking before any new dependency, and a `&lt;select&gt;` and a form don't need one.
- **Only the unit switcher, not the rest of `system-design.md` §22's "Shell" bullet** (program-year selector, date-range selector, grant-filtered left nav) — those are independent widgets with their own data needs; bundling them here would be exactly the kind of scope creep `CLAUDE.md` warns against ("fix the ticket").
- **Server Components own every data fetch; `'use client'` is scoped to exactly the two interactive pieces** (the login form, the switcher's `<select>` + submit) — `CLAUDE.md`'s frontend convention. The switcher receives its unit list as a prop from the Server Component layout, not via its own client-side fetch-on-mount.
- **`NEXT_PUBLIC_API_URL`** (already the dashboard's one existing env var, used by `lib/api.ts`'s health check) **is reused for the route handlers' server-to-server calls** — no new env var. It's misleadingly `NEXT_PUBLIC_`-prefixed for what's about to become a server-only usage too, but renaming it is a separate, unrelated cleanup, not this slice's job.
- **Verification is manual-browser-driven, not a new Playwright suite, this slice.** `playwright.config.ts` exists but `tests/e2e/` doesn't yet, and the browser binary Playwright 1.62 wants (chromium-1234) isn't in the local cache (only older 1223/1228 builds are) — installing it is a one-time environment action, not a code change, and downloading it unprompted mid-slice isn't this slice's call to make. More fundamentally, a real Playwright run needs the API + Postgres + Redis actually running with known login credentials, and no seed/fixture strategy for that exists yet (`playwright.config.ts`'s `webServer` currently boots only the dashboard). Both are flagged here rather than guessed at or silently built around. This slice is verified instead by running the real dev stack (`docker compose up`, `pnpm --filter api dev`, `pnpm --filter dashboard dev`) and driving the actual login → see units → switch flow in a real browser by hand — satisfying `CLAUDE.md`'s "drive the real behaviour... not just green tests" for UI work without inventing e2e infrastructure this slice doesn't need to invent.

**Files:**

- New: `apps/dashboard/src/lib/session.ts` (`getSession()`, `getSwitchableUnits()` — server-only, read the dashboard's own cookie via `next/headers`, forward it to the API).
- New: `apps/dashboard/src/lib/session-proxy.ts` (added during implementation — `callApi()`, `extractSessionCookie()`, `SESSION_COOKIE_OPTIONS`, shared by both route handlers below).
- New: `apps/dashboard/src/app/api/session/login/route.ts`, `apps/dashboard/src/app/api/session/switch-unit/route.ts`.
- New: `apps/dashboard/src/app/login/page.tsx`, `apps/dashboard/src/components/LoginForm.tsx` (`'use client'`).
- New: `apps/dashboard/src/components/UnitSwitcher.tsx` (`'use client'`).
- Modify: `apps/dashboard/src/app/layout.tsx` (header shell: full name + `UnitSwitcher` when a session exists, a login link when it doesn't), `apps/dashboard/src/app/globals.css` (header/form styling, no new dependency).

**Implementation steps** (frontend — no DB/Testcontainers layer here, so this isn't the usual red/green TDD cadence; each step is implement-then-manually-verify against the real running stack):

- [x] **Step 1: `lib/session.ts` — `getSession()` and `getSwitchableUnits()`**

  Implemented as planned. A sibling `lib/session-proxy.ts` was added alongside it (not originally itemized in Files, but the natural home for logic the two route handlers in Steps 2–3 both need — extracting the token from an upstream `Set-Cookie`, and the shared `SESSION_COOKIE_OPTIONS`) rather than duplicating that parsing in both routes.

- [x] **Step 2: `POST /api/session/login`**

  Implemented as planned.

- [x] **Step 3: `POST /api/session/switch-unit`**

  Implemented as planned.

- [x] **Step 4: `LoginForm` + `/login` page**

  Implemented as planned.

- [x] **Step 5: `UnitSwitcher` component**

  Implemented with one simplification from the plan: the `<select>` submits on `onChange` directly (a `'use client'` handler posting to the switch-unit route and calling `router.refresh()`), not as a separate submit button — one fewer control, same behavior, and progressive JS-disabled enhancement wasn't worth the extra markup for a slice this scoped-down. No-JS form fallback dropped as a result; not a regression against anything specified, since nothing else in the app works without JS either (Server Components still render, but every interactive piece here already assumes it).

- [x] **Step 6: Wire the layout shell**

  Implemented as planned.

- [x] **Step 7: Manual verification against the real dev stack**

  Two adjustments from the plan's sketch, both because the plan under-specified what's actually available:

  1. **Fixture creation wasn't "through the actual API"** as drafted — there is no HTTP route for `createRoot` at all (M2 Slice 2 explicitly scoped that out: "No root-creation route"), so a region root can't be created over HTTP by design, not by oversight. Used a temporary script (`apps/api/scripts/tmp-dev-seed-demo-user.ts`, written, run once, deleted — never committed) that calls `OrgUnitRepository`/`PersonRepository`/`RoleAssignmentRepository`/`GrantAdminRepository` directly against the local dev Postgres, the same repositories every integration test already uses, just pointed at the persistent dev DB instead of a Testcontainer.
  2. **Verification drove the real HTTP behavior via `curl` with a cookie jar, not a GUI browser** — this environment has no interactive browser session available; `curl -c/-b cookies.txt` exercises the exact same cookie-store-and-resend semantics a browser does, against the real running dashboard + API + Postgres + Redis, which is what actually matters (the assertion is about the HTTP contract between dashboard/API/browser storage, not about pixels).

  Ran: `docker compose -f infra/docker-compose.yml up -d redis` (Postgres was already running locally on the port `.env` points at), `pnpm db:deploy`, `pnpm db:seed`, the temporary fixture script, `pnpm --filter @toastmasters/api dev`, `pnpm --filter @toastmasters/dashboard dev`. Observed, in order: (1) `GET /` with no cookie renders the "Log in" link; (2) `POST /api/session/login` with correct credentials returns the session body and sets an `HttpOnly` cookie on `localhost:3000` (the dashboard's own origin, not the API's); (3) `GET /` with that cookie renders "Demo Person" and a `<select>` with both switchable units, exactly the shape `GET /switchable-units` returned; (4) `POST /api/session/switch-unit` returns the new `activeUnitId` and rotates the cookie's token; (5) `GET /` afterward reflects the new `activeUnitId` in the rendered markup; (6) `GET /login` while already logged in 307-redirects to `/`; (7) a wrong password returns 401 with no cookie set; (8) after removing the cookie, `GET /` shows the "Log in" link again. All eight matched expectations exactly.

- [x] **Step 8: Full gate**

  `pnpm --filter @toastmasters/dashboard lint && pnpm --filter @toastmasters/dashboard typecheck && pnpm --filter @toastmasters/dashboard build` — all green (lint: the one pre-existing unrelated warning only). `pnpm --filter @toastmasters/api test && pnpm --filter @toastmasters/api test:int` — 72 unit / 324 integration, both unchanged from Slice 6 (this slice touched no `apps/api` source).

- [x] **Step 9: Commit**

```bash
git add apps/dashboard docs/plans/m2-identity-org.md
git commit -m "feat(dashboard): login and unit switcher — the first dashboard UI"
```

---

## Slice 8 — Permission-versioning UX (mid-session JWT reissue)

**Why:** `rbac-design.md` §5: "the session JWT carries `v`. If `v` ≠ current `permission_version`, the resolved set is rebuilt and the token reissued." The engine side of this already works (`authorize()` never trusts `v`, always resolves live from `AccessRepository.effectiveGrants()`), but nothing keeps the session cookie's own `v` claim fresh after a mid-session revocation — a real (if minor) polish gap, not a security one. Closing it here rather than leaving M2's scope note pointing at it forever.

**Scope, kept small per current guidance to favor velocity over exhaustive coverage this session:** `JwtAuthGuard` gains a `PersonRepository` lookup after verifying the token; on a `v` mismatch it reissues the cookie with the current `permissionVersion` (same `activeUnitId`/`programYearId`/`sub`) via the existing `SessionService`. This also closes a latent gap for free: a JWT for a since-deleted person previously passed the guard on signature alone — now `findById` returning `null` is a 401. Two tests: one proving reissue-on-mismatch (a role assignment happens, `v` bumps, the next request under the old cookie gets a fresh `Set-Cookie` with the new `v`), one proving _no_ reissue when `v` is already current (no `Set-Cookie` header) — the negative case that keeps this from silently reissuing on every request.

**Files:** `apps/api/src/common/auth/jwt-auth.guard.ts`; `apps/api/test/integration/auth-http.int-spec.ts`.

- [x] Implement + test. Full gate run once at the end.
- [x] Commit: `feat(access): reissue the session cookie when permissionVersion drifts mid-session`

---
