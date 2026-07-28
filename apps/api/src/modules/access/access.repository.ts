import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Action, Grant } from '../../common/authz/authz.types';
import type { GrantCacheService } from './grant-cache.service';

interface PathRow {
  path: string;
}

// A function, not a module-level constant — `new Date()` must be evaluated
// fresh on every call. A frozen constant would capture "now" once at import
// time, and Testcontainers startup alone can take 10+ seconds, long enough
// for an "already expired" fixture in a later test to still compare as valid
// against a comparison timestamp captured before the module even loaded.
function notExpired() {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

@Injectable()
export class AccessRepository {
  constructor(
    private readonly db: PrismaClient = getPrisma(),
    private readonly cache?: GrantCacheService,
  ) {}

  /** rbac-design.md §4.2 + §5: all four grant sources, cached by personId:permissionVersion. */
  async effectiveGrants(personId: string): Promise<Grant[]> {
    const permissionVersion = await this.permissionVersionOf(personId);

    if (this.cache) {
      const cached = await this.cache.get(personId, permissionVersion);
      if (cached) return cached;
    }

    const [platformGrants, domainGrants, overrideGrants, directGrants] = await Promise.all([
      this.platformRoleGrants(personId),
      this.domainRoleGrants(personId),
      this.unitPolicyOverrides(personId),
      this.personGrants(personId),
    ]);
    const grants = [...platformGrants, ...domainGrants, ...overrideGrants, ...directGrants];

    if (this.cache) {
      await this.cache.set(personId, permissionVersion, grants);
    }

    return grants;
  }

  /**
   * rbac-design.md §2.1: restricted resources are "always logged on read".
   * Called from AuthzService.authorize() after an allowed decision — applies
   * uniformly to every role, not just system_admin's break-glass reads.
   */
  async auditRestrictedReadIfApplicable(request: {
    principal: { userId: string };
    resource: string;
    action: Action;
  }): Promise<void> {
    if (request.action !== 'read') return;
    const catalog = await this.db.resourceCatalog.findUnique({
      where: { resource: request.resource },
    });
    if (catalog?.sensitivity !== 'restricted') return;
    await this.db.auditEvent.create({
      data: {
        actorPersonId: request.principal.userId,
        type: 'restricted_read',
        resource: request.resource,
        action: request.action,
      },
    });
  }

  private async permissionVersionOf(personId: string): Promise<number> {
    const person = await this.db.person.findUnique({
      where: { id: personId },
      select: { permissionVersion: true },
    });
    return person?.permissionVersion ?? 1;
  }

  private async platformRoleGrants(personId: string): Promise<Grant[]> {
    const assignments = await this.db.platformRoleAssignment.findMany({
      where: { personId, ...notExpired() },
    });
    const out: Grant[] = [];
    for (const pa of assignments) {
      const scope = pa.orgUnitId ? await this.pathOf(pa.orgUnitId) : await this.regionRootPath();
      if (pa.role === 'system_admin') {
        out.push(...(await this.systemAdminGrants(scope)));
        continue;
      }
      out.push(...(await this.grantsForRoleAtScope(pa.role, scope)));
    }
    return out;
  }

  /**
   * The deployment's break-glass divergence (docs/superpowers/specs/...  §6):
   * system_admin's *resolution* grants everything except the four restricted
   * resources — not a role_template_grant row (Slice 3 seeded none), and not
   * a step-0 bypass in evaluate()/authorize() (rbac-design.md §4.1's sketch).
   * Restricted access only ever comes from a minted break-glass person_grant.
   */
  private async systemAdminGrants(scope: string): Promise<Grant[]> {
    const resources = await this.db.resourceCatalog.findMany({
      where: { sensitivity: { not: 'restricted' } },
    });
    const out: Grant[] = [];
    for (const r of resources) {
      for (const action of r.allowedActions) {
        out.push({
          role: 'system_admin',
          scope,
          resource: r.resource,
          action,
          condition: 'any',
          effect: 'allow',
        });
      }
    }
    return out;
  }

  private async domainRoleGrants(personId: string): Promise<Grant[]> {
    const assignments = await this.db.roleAssignment.findMany({
      where: { personId, status: 'active' },
    });
    const out: Grant[] = [];
    for (const ra of assignments) {
      const scope = await this.pathOf(ra.orgUnitId);
      out.push(...(await this.grantsForRoleAtScope(ra.role, scope)));
    }
    return out;
  }

  /**
   * rbac-design.md §4.2(c): unit-policy overrides apply to the unit itself —
   * exactOnly, regardless of the overridden role's own scope_rule. Matches
   * against either a direct person subject or the person's active domain
   * roles at that unit.
   */
  private async unitPolicyOverrides(personId: string): Promise<Grant[]> {
    const activeRoles = await this.db.roleAssignment.findMany({
      where: { personId, status: 'active' },
      select: { role: true, orgUnitId: true },
    });
    const rows = await this.db.unitPolicyGrant.findMany({
      where: {
        ...notExpired(),
        OR: [
          { subjectKind: 'person', subjectPersonId: personId },
          ...(activeRoles.length
            ? [
                {
                  subjectKind: 'role' as const,
                  subjectRole: { in: activeRoles.map((r) => r.role) },
                  orgUnitId: { in: activeRoles.map((r) => r.orgUnitId) },
                },
              ]
            : []),
        ],
      },
    });
    const out: Grant[] = [];
    for (const ov of rows) {
      const scope = await this.pathOf(ov.orgUnitId);
      out.push({
        role: `policy:${ov.orgUnitId}`,
        scope,
        exactOnly: true,
        resource: ov.resource,
        action: ov.action,
        condition: ov.condition,
        effect: ov.effect,
      });
    }
    return out;
  }

  /** rbac-design.md §4.2(d): direct grants — exceptions, expiry enforced here. */
  private async personGrants(personId: string): Promise<Grant[]> {
    const rows = await this.db.personGrant.findMany({ where: { personId, ...notExpired() } });
    const out: Grant[] = [];
    for (const pg of rows) {
      const scope = await this.pathOf(pg.orgUnitId);
      out.push({
        role: `direct:${pg.reason}`,
        scope,
        exactOnly: true,
        resource: pg.resource,
        action: pg.action,
        condition: pg.condition,
        effect: pg.effect,
      });
    }
    return out;
  }

  /** Shared by both role-template grant sources: look up the template once, stamp scope + exactOnly. */
  private async grantsForRoleAtScope(role: string, scope: string): Promise<Grant[]> {
    const template = await this.db.roleTemplate.findUnique({ where: { role } });
    if (!template) return []; // role not in the catalogue — nothing to grant
    const exactOnly = template.scopeRule === 'self_unit';
    const rows = await this.db.roleTemplateGrant.findMany({ where: { role } });
    return rows.map((g) => ({
      role,
      scope,
      exactOnly,
      resource: g.resource,
      action: g.action,
      condition: g.condition,
      effect: g.effect,
    }));
  }

  /** Not private — GrantAdminRepository resolves target scopes for canDelegate the same way. */
  async pathOf(orgUnitId: string): Promise<string> {
    const rows = await this.db.$queryRaw<PathRow[]>`
      SELECT path::text AS path FROM org_unit WHERE id = ${orgUnitId}::uuid
    `;
    if (!rows[0]) throw new Error(`Org unit ${orgUnitId} not found`);
    return rows[0].path;
  }

  /**
   * A platform_role_assignment with org_unit_id = NULL means global reach —
   * resolved to the region root's own path, so ordinary prefix matching
   * covers the whole tree with no special-casing needed in evaluate().
   */
  async regionRootPath(): Promise<string> {
    const rows = await this.db.$queryRaw<PathRow[]>`
      SELECT path::text AS path FROM org_unit WHERE type = 'region' LIMIT 1
    `;
    if (!rows[0]) throw new Error('No region root org unit exists');
    return rows[0].path;
  }
}
