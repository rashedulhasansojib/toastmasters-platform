import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Grant } from '../../common/authz/authz.types';

interface PathRow {
  path: string;
}

@Injectable()
export class AccessRepository {
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /**
   * rbac-design.md §4.2: platform ∪ domain-role-template grants. Unit-policy
   * overrides and direct person grants are Slice 6 — no table exists yet, so
   * those two positions are simply absent from the union.
   */
  async effectiveGrants(personId: string): Promise<Grant[]> {
    const [platformGrants, domainGrants] = await Promise.all([
      this.platformRoleGrants(personId),
      this.domainRoleGrants(personId),
    ]);
    return [...platformGrants, ...domainGrants];
  }

  private async platformRoleGrants(personId: string): Promise<Grant[]> {
    const assignments = await this.db.platformRoleAssignment.findMany({
      where: { personId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    const out: Grant[] = [];
    for (const pa of assignments) {
      const scope = pa.orgUnitId ? await this.pathOf(pa.orgUnitId) : await this.regionRootPath();
      out.push(...(await this.grantsForRoleAtScope(pa.role, scope)));
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

  /** Shared by both grant sources: look up the template once, stamp every grant with its scope + exactOnly. */
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

  private async pathOf(orgUnitId: string): Promise<string> {
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
  private async regionRootPath(): Promise<string> {
    const rows = await this.db.$queryRaw<PathRow[]>`
      SELECT path::text AS path FROM org_unit WHERE type = 'region' LIMIT 1
    `;
    if (!rows[0]) throw new Error('No region root org unit exists');
    return rows[0].path;
  }
}
