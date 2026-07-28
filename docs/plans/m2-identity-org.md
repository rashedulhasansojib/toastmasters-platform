# M2 Identity & Org — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan slice-by-slice. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a district top-down by invitation, with delegation that cannot escalate. `roadmap.md` §5's ship gate: "A district is built top-down purely by invitation; an invitation carrying a role passes the same delegation check as a direct grant."

**Architecture:** Builds directly on M1's engine — one `authorize()` gate, `effectiveGrants()`, `canDelegate()`, the `ltree` org tree, `permission_version` revocation — none of that changes in M2. This milestone adds the identity workflows around it: invitations, unit policies, permission versioning UX (session counter already exists from M1 Slice 5/8), the org tree editor, the unit switcher, `ActivityEvent` emission, and an access inspector extended to cover invitations/delegation.

**Tech Stack:** Same as M1 — NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Postgres + `ltree`, Redis/BullMQ, Zod 4, Vitest 4 + Testcontainers, Argon2id + `jose`.

> **Scope note.** M1's plan sketched its full slice roadmap before detailing
> any slice, because the whole milestone's shape was known up front. M2 is
> being scoped incrementally instead: only **Slice 1** below is detailed and
> execution-ready. Later M2 slices (unit policies, permission versioning UX,
> org tree editor, unit switcher, `ActivityEvent` emission, access-inspector
> coverage of invitations) will each get their own detailed section, written
> just before they're implemented, once Slice 1's shape has proven out —
> mirroring M1's own governing principle: "if `authorize()` feels awkward
> here, fix it before M2" applies equally to "if the invitation shape feels
> awkward here, fix it before the next slice."

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

- [ ] **Step 1: Schema, seed, migration**

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

- [ ] **Step 2: `InvitationRepository`**

  Red (`invitation.repository.int-spec.ts`): `create` persists a row with the given `tokenHash` and returns the public shape (no `tokenHash` field); `findByTokenHash` round-trips it and returns `null` for an unknown hash; `accept` — given a pending, unexpired invitation — creates a new `Person` when the email is unknown, sets `passwordHash`+`status:'active'`, creates an `active` `RoleAssignment` with the given term dates, bumps `permission_version`, and flips the invitation to `status:'accepted'` with `acceptedPersonId` set; called again with an email that already has a `Person` with a `passwordHash` set, it does **not** overwrite the existing hash (attach, not overwrite) and still creates the `RoleAssignment`; called with an expired or non-`pending` invitation, it throws (`UnauthorizedException`) and writes nothing.

  Green — plain Prisma CRUD, `@Inject(PRISMA_CLIENT)` from the start; `accept` wraps the whole read-validate-write sequence in one `db.$transaction`, re-reading the invitation by `tokenHash` inside the transaction (not trusting a pre-transaction read) exactly as sketched in the Interfaces section above.

  Rerun — green.

- [ ] **Step 3: `InvitationRateLimiter`**

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

- [ ] **Step 4: `InvitationService.create()` — the delegation check**

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

- [ ] **Step 5: `InvitationService.accept()`**

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

- [ ] **Step 6: `InvitationController` + module wiring**

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

- [ ] **Step 7: End-to-end HTTP tests**

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

- [ ] **Step 8: Authorisation-matrix update**

  Red — add `{ resource: 'identity.invitation', actions: ['create'] }` to `authorization-matrix.int-spec.ts`'s `RESOURCE_ACTIONS`, and add `'unit_admin'` coverage (it's already in `ROLES`/`CLUB_SCOPED_ROLES` from M1 Slice 10 — no list change needed, just the new resource row it now has a real grant for).

  Green — no production code change; the matrix is generated from `role_template_grant`, so Step 1's seed change is already reflected.

  Rerun — green, full matrix suite.

- [ ] **Step 9: Commit**

```bash
git add packages/db packages/contracts/src/identity.ts apps/api/src/modules/access/access.module.ts apps/api/src/modules/identity apps/api/test/integration/invitation.repository.int-spec.ts apps/api/test/integration/invitation-http.int-spec.ts apps/api/test/integration/authorization-matrix.int-spec.ts
git commit -m "feat(identity): invitations with the delegation check — M2 slice 1"
```

---
