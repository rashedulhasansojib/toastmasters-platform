# M2 Identity & Org — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan slice-by-slice. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a district top-down by invitation, with delegation that cannot escalate. `roadmap.md` §5's ship gate: "A district is built top-down purely by invitation; an invitation carrying a role passes the same delegation check as a direct grant."

**Architecture:** Builds directly on M1's engine — one `authorize()` gate, `effectiveGrants()`, `canDelegate()`, the `ltree` org tree, `permission_version` revocation — none of that changes in M2. This milestone adds the identity workflows around it: invitations, unit policies, permission versioning UX (session counter already exists from M1 Slice 5/8), the org tree editor, the unit switcher, `ActivityEvent` emission, and an access inspector extended to cover invitations/delegation.

**Tech Stack:** Same as M1 — NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Postgres + `ltree`, Redis/BullMQ, Zod 4, Vitest 4 + Testcontainers, Argon2id + `jose`.

> **Scope note.** M1's plan sketched its full slice roadmap before detailing
> any slice, because the whole milestone's shape was known up front. M2 is
> being scoped incrementally instead: **Slices 1–2** below are detailed and
> execution-ready. Later M2 slices (unit policies, permission versioning UX,
> unit switcher, `ActivityEvent` emission beyond reparent, access-inspector
> coverage of invitations) will each get their own detailed section, written
> just before they're implemented, once each prior slice's shape has proven
> out — mirroring M1's own governing principle: "if `authorize()` feels
> awkward here, fix it before M2" applies equally to "if the invitation/org-
> editor shape feels awkward here, fix it before the next slice."

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

- [ ] **Step 1: Schema, seed, migration**

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

- [ ] **Step 2: `OrgUnitRepository.reparent()` — permission-version bump + audit event**

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

- [ ] **Step 3: `OrgUnitService`**

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

- [ ] **Step 4: `OrgUnitController` + module wiring**

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

- [ ] **Step 5: End-to-end HTTP tests**

  Red (`org-http.int-spec.ts`, real Postgres + Redis, real `AppModule`, `jose`-minted JWTs):

  1. **The M2 ship gate, fully over HTTP for the first time:** seed only a region root and a `unit_admin` platform-role holder at that region (self_subtree — the one-time bootstrap this deployment does once, matching Slice 1's own "bootstrapping the first officer isn't the thing under test" precedent). `POST /v1/org-units/:regionId/children` `{type:'district', ...}` → 201; `POST /v1/org-units/:districtId/children` `{type:'club', ...}` → 201; `POST /v1/org-units/:clubId/invitations` (Slice 1's route) `{email, role:'club_president', programYearId}` → 201; accept it (Slice 1's route) → 200; the accepted person holds an active `club_president` `RoleAssignment` at the newly created club. Nothing beyond the region root and the `unit_admin` grant was seeded directly — the whole district was built through HTTP.
  2. **Destination-authority denial:** a second `unit_admin` scoped only to District A (not the region) attempts `POST /v1/org-units/:clubInDistrictA/reparent` `{newParentId: districtB}` where District B is outside their authority → 403; the club's path is unchanged afterward.
  3. **Permission-version bump on reparent:** a `club_president` at a club about to be moved — capture `permissionVersion` before; a suitably-authorized `unit_admin` (scoped at the region) reparents that club to a different district → 200; the president's `permissionVersion` in the DB has incremented.

  Green — nothing new to implement; this step verifies Steps 1–4, run for real.

  Rerun — green. Then the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, plus `pnpm test:int`.

- [ ] **Step 6: Authorisation-matrix update**

  Red — add `{ resource: 'org.unit', actions: ['create', 'update'] }` to `authorization-matrix.int-spec.ts`'s `RESOURCE_ACTIONS`.

  Green — no production code change; generated from `role_template_grant`.

  Rerun — green, full matrix suite.

- [ ] **Step 7: Commit**

```bash
git add packages/db packages/contracts/src/org.ts apps/api/src/modules/org apps/api/test/integration/org.repository.int-spec.ts apps/api/test/integration/org-http.int-spec.ts apps/api/test/integration/authorization-matrix.int-spec.ts apps/api/test/integration/access.seed.int-spec.ts
git commit -m "feat(org): org tree editor — create + transactional reparent with destination delegation check"
```

---
