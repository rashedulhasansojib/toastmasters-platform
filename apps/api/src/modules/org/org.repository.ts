import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { OrgUnit, OrgUnitType, OrgUnitWithCount } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

// Raw rows come back with snake_case columns and ltree path as text.
interface OrgUnitRow {
  id: string;
  type: OrgUnitType;
  parent_id: string | null;
  path: string;
  depth: number;
  name: string;
  code: string;
  status: OrgUnit['status'];
  timezone: string;
}

function toOrgUnit(row: OrgUnitRow): OrgUnit {
  return {
    id: row.id,
    type: row.type,
    parentId: row.parent_id,
    path: row.path,
    depth: row.depth,
    name: row.name,
    code: row.code,
    status: row.status,
    timezone: row.timezone,
  };
}

@Injectable()
export class OrgUnitRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async createRoot(input: {
    type: 'region';
    code: string;
    name: string;
    timezone: string;
  }): Promise<OrgUnit> {
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      INSERT INTO org_unit (id, type, parent_id, path, depth, name, code, status, timezone, created_at, updated_at)
      VALUES (gen_random_uuid(), ${input.type}::"OrgUnitType", NULL, ${input.code}::ltree, 0,
              ${input.name}, ${input.code}, 'active'::"OrgUnitStatus", ${input.timezone}, now(), now())
      RETURNING id, type, parent_id, path::text AS path, depth, name, code, status, timezone
    `;
    return toOrgUnit(rows[0]!);
  }

  async createChild(input: {
    parentId: string;
    type: OrgUnitType;
    code: string;
    name: string;
    timezone: string;
  }): Promise<OrgUnit> {
    return this.db.$transaction(async (tx) => {
      const parents = await tx.$queryRaw<Array<{ path: string; depth: number }>>`
        SELECT path::text AS path, depth FROM org_unit WHERE id = ${input.parentId}::uuid
      `;
      const parent = parents[0];
      if (!parent) throw new Error(`Parent org unit ${input.parentId} not found`);

      const rows = await tx.$queryRaw<OrgUnitRow[]>`
        INSERT INTO org_unit (id, type, parent_id, path, depth, name, code, status, timezone, created_at, updated_at)
        VALUES (gen_random_uuid(), ${input.type}::"OrgUnitType", ${input.parentId}::uuid,
                (${parent.path} || '.' || ${input.code})::ltree, ${parent.depth + 1},
                ${input.name}, ${input.code}, 'active'::"OrgUnitStatus", ${input.timezone}, now(), now())
        RETURNING id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      `;
      return toOrgUnit(rows[0]!);
    });
  }

  /**
   * Rename / retime, plus an audit row in the same transaction. `path`, `code`
   * and `type` are untouched by design — see updateOrgUnitRequestSchema.
   */
  async update(
    id: string,
    changes: { name?: string; timezone?: string },
    actorId: string,
  ): Promise<OrgUnit> {
    return this.db.$transaction(async (tx) => {
      const before = (
        await tx.$queryRaw<OrgUnitRow[]>`
          SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
          FROM org_unit WHERE id = ${id}::uuid
        `
      )[0];
      if (!before) throw new Error(`Org unit ${id} not found`);

      const rows = await tx.$queryRaw<OrgUnitRow[]>`
        UPDATE org_unit
        SET name = COALESCE(${changes.name ?? null}, name),
            timezone = COALESCE(${changes.timezone ?? null}, timezone),
            updated_at = now()
        WHERE id = ${id}::uuid
        RETURNING id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      `;

      // Scoped to the *parent*, not the unit itself — audit_event is
      // REVOKE UPDATE, DELETE, so a row pointing at this unit would be an
      // immovable foreign key that permanently blocks the unit's own hard
      // delete. Renaming a unit must not make it undeletable. The parent is
      // still the right subtree for a path-prefix audit query, and
      // `targetUnitId` keeps the precise subject. org_unit_deleted below
      // does the same thing for the same reason.
      await tx.auditEvent.create({
        data: {
          actorPersonId: actorId,
          type: 'org_unit_updated',
          resource: 'org.unit',
          action: 'update',
          orgUnitId: before.parent_id,
          metadata: {
            targetUnitId: id,
            path: before.path,
            before: { name: before.name, timezone: before.timezone },
            after: { name: rows[0]!.name, timezone: rows[0]!.timezone },
          },
        },
      });

      return toOrgUnit(rows[0]!);
    });
  }

  /**
   * Counts the rows that would block a delete. Not exhaustive over all ~40
   * OrgUnit relations — it names the ones an admin can actually act on, and
   * the foreign keys are the real backstop for anything else (every relation
   * in the schema is Restrict; only RoleTemplate.role cascades). An empty
   * array therefore means "probably deletable", and the FK still has the
   * final say inside `remove()`.
   */
  async deleteBlockers(id: string): Promise<Array<{ relation: string; count: number }>> {
    const [children, memberships, roles, platformRoles, meetings, invitations, ledger, audit] =
      await Promise.all([
        this.db.$queryRaw<Array<{ n: bigint }>>`
          SELECT count(*) AS n FROM org_unit WHERE parent_id = ${id}::uuid`,
        this.db.clubMembership.count({ where: { clubUnitId: id } }),
        this.db.roleAssignment.count({ where: { orgUnitId: id } }),
        this.db.platformRoleAssignment.count({ where: { orgUnitId: id } }),
        this.db.meeting.count({ where: { clubUnitId: id } }),
        this.db.invitation.count({ where: { orgUnitId: id } }),
        this.db.ledgerEntry.count({ where: { orgUnitId: id } }),
        this.db.auditEvent.count({ where: { orgUnitId: id } }),
      ]);

    const counts: Array<{ relation: string; count: number }> = [
      { relation: 'child units', count: Number(children[0]?.n ?? 0) },
      { relation: 'club memberships', count: memberships },
      { relation: 'role assignments', count: roles },
      { relation: 'platform role assignments', count: platformRoles },
      { relation: 'meetings', count: meetings },
      { relation: 'invitations', count: invitations },
      { relation: 'ledger entries', count: ledger },
      { relation: 'audit events', count: audit },
    ];
    return counts.filter((c) => c.count > 0);
  }

  /**
   * Hard delete, audited against the *parent* — the unit's own id is a dangling
   * reference the instant the row goes, and audit_event.org_unit_id is a real
   * foreign key. The deleted unit's identity is preserved in `metadata`.
   */
  async remove(id: string, actorId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const unit = (
        await tx.$queryRaw<OrgUnitRow[]>`
          SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
          FROM org_unit WHERE id = ${id}::uuid
        `
      )[0];
      if (!unit) throw new Error(`Org unit ${id} not found`);

      await tx.auditEvent.create({
        data: {
          actorPersonId: actorId,
          type: 'org_unit_deleted',
          resource: 'org.unit',
          action: 'delete',
          orgUnitId: unit.parent_id,
          metadata: {
            deletedUnitId: unit.id,
            path: unit.path,
            name: unit.name,
            code: unit.code,
            type: unit.type,
          },
        },
      });

      await tx.$executeRaw`DELETE FROM org_unit WHERE id = ${id}::uuid`;
    });
  }

  async findByPath(path: string): Promise<OrgUnit | null> {
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      FROM org_unit WHERE path = ${path}::ltree
    `;
    return rows[0] ? toOrgUnit(rows[0]) : null;
  }

  async findById(id: string): Promise<OrgUnit | null> {
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      FROM org_unit WHERE id = ${id}::uuid
    `;
    return rows[0] ? toOrgUnit(rows[0]) : null;
  }

  /** The unit switcher's batch lookup (Slice 6) — one query, not one findById per unit. Unknown ids are silently omitted, matching findById's null-not-throw convention. */
  async findByIds(ids: string[]): Promise<OrgUnit[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      FROM org_unit WHERE id = ANY(${ids}::uuid[])
    `;
    return rows.map(toOrgUnit);
  }

  async findSubtree(path: string): Promise<OrgUnit[]> {
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      FROM org_unit WHERE path <@ ${path}::ltree
      ORDER BY path
    `;
    return rows.map(toOrgUnit);
  }

  /**
   * Top-level org units (`parent_id IS NULL`) — the org-tree browser's root
   * level. Always ≤1 today (`org_unit_single_region_root`), but not assumed
   * to be exactly one: an empty tree renders as an empty card grid.
   */
  async findRootsWithCounts(): Promise<OrgUnitWithCount[]> {
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      FROM org_unit WHERE parent_id IS NULL ORDER BY path
    `;
    return this.attachCounts(rows.map(toOrgUnit));
  }

  /** Direct children of `parentId`, for one level of the org-tree browser. */
  async findChildrenWithCounts(parentId: string): Promise<OrgUnitWithCount[]> {
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      FROM org_unit WHERE parent_id = ${parentId}::uuid ORDER BY path
    `;
    return this.attachCounts(rows.map(toOrgUnit));
  }

  /**
   * Ancestor chain, root-to-parent, excluding `path` itself — the org-tree
   * browser's breadcrumb (the caller appends the parent's own row last).
   */
  async findAncestors(path: string): Promise<OrgUnit[]> {
    const rows = await this.db.$queryRaw<OrgUnitRow[]>`
      SELECT id, type, parent_id, path::text AS path, depth, name, code, status, timezone
      FROM org_unit WHERE path @> ${path}::ltree AND path != ${path}::ltree
      ORDER BY path
    `;
    return rows.map(toOrgUnit);
  }

  /**
   * Attaches `childCount` to each unit: the count of its own org-unit
   * children, except `club` rows — a leaf in the org tree — which get the
   * active member count instead (rbac-design's club-level, not per-member,
   * exposure). Two grouped queries total regardless of how many units are
   * passed in, not one per unit.
   */
  private async attachCounts(units: OrgUnit[]): Promise<OrgUnitWithCount[]> {
    const clubIds = units.filter((u) => u.type === 'club').map((u) => u.id);
    const otherIds = units.filter((u) => u.type !== 'club').map((u) => u.id);

    const [childCountRows, memberCountRows] = await Promise.all([
      otherIds.length
        ? this.db.$queryRaw<Array<{ parent_id: string; n: bigint }>>`
            SELECT parent_id, count(*) AS n FROM org_unit
            WHERE parent_id = ANY(${otherIds}::uuid[]) GROUP BY parent_id
          `
        : Promise.resolve([]),
      clubIds.length
        ? this.db.$queryRaw<Array<{ club_unit_id: string; n: bigint }>>`
            SELECT club_unit_id, count(*) AS n FROM club_membership
            WHERE club_unit_id = ANY(${clubIds}::uuid[])
              AND local_status = 'active'::"ClubMembershipLocalStatus"
            GROUP BY club_unit_id
          `
        : Promise.resolve([]),
    ]);

    const childCountByParent = new Map(childCountRows.map((r) => [r.parent_id, Number(r.n)]));
    const memberCountByClub = new Map(memberCountRows.map((r) => [r.club_unit_id, Number(r.n)]));

    return units.map((u) => ({
      ...u,
      childCount:
        u.type === 'club'
          ? (memberCountByClub.get(u.id) ?? 0)
          : (childCountByParent.get(u.id) ?? 0),
    }));
  }

  /**
   * `actorId` is optional so the pre-existing 2-arg call sites (fixtures that
   * reparent directly, not through the HTTP route) keep working unchanged —
   * the audit event is only written when an actor is known.
   */
  async reparent(nodeId: string, newParentId: string, actorId?: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const node = (
        await tx.$queryRaw<Array<{ path: string; parent_id: string | null }>>`
          SELECT path::text AS path, parent_id FROM org_unit WHERE id = ${nodeId}::uuid`
      )[0];
      const parent = (
        await tx.$queryRaw<Array<{ path: string; depth: number }>>`
          SELECT path::text AS path, depth FROM org_unit WHERE id = ${newParentId}::uuid`
      )[0];
      if (!node || !parent) throw new Error('Node or new parent not found');

      // Reject moving a node under itself or under one of its own
      // descendants. `path <@ node.path` matches the node's own row too (a
      // path is a descendant-or-self of itself), so this single check covers
      // both cases: newParentId === nodeId, and newParentId anywhere in
      // nodeId's subtree. Without this guard the UPDATE below still "runs"
      // but produces a parent_id cycle and a doubly-nested, corrupted path.
      const illegal = await tx.$queryRaw<Array<{ found: number }>>`
        SELECT 1 AS found FROM org_unit
        WHERE id = ${newParentId}::uuid AND path <@ ${node.path}::ltree
      `;
      if (illegal.length > 0) {
        throw new Error('Cannot reparent a node under itself or its own descendant');
      }

      const code = node.path.split('.').pop()!;
      const newPath = `${parent.path}.${code}`;

      // Rewrite the node and every descendant's path in one statement.
      //
      // subpath(path, offset) raises "invalid positions" when offset equals
      // nlevel(path) exactly — which is always true for the node's own row,
      // since `<@` matches self too (offset == nlevel(node.path) there). The
      // CASE branches route the self-row around subpath entirely instead of
      // relying on it to return an empty tail.
      const affected = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE org_unit
        SET path = CASE
                     WHEN path = ${node.path}::ltree THEN ${newPath}::ltree
                     ELSE ${newPath}::ltree || subpath(path, nlevel(${node.path}::ltree))
                   END,
            parent_id = CASE WHEN id = ${nodeId}::uuid THEN ${newParentId}::uuid ELSE parent_id END,
            depth = CASE
                      WHEN path = ${node.path}::ltree THEN nlevel(${newPath}::ltree) - 1
                      ELSE nlevel(${newPath}::ltree || subpath(path, nlevel(${node.path}::ltree))) - 1
                    END,
            updated_at = now()
        WHERE path <@ ${node.path}::ltree
        RETURNING id
      `;

      // rbac-design.md §5: "org unit reparented → bump everyone with a grant
      // under either path" — the moved node's own row is the same before and
      // after this transaction, so this is one id set, not two to union. See
      // the Slice 2 plan's scoping note for why this set (not ancestors) is
      // the correct one, not merely a simpler one.
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
            metadata: {
              oldParentId: node.parent_id,
              newParentId,
              oldPath: node.path,
              newPath,
            },
          },
        });
      }
    });
  }
}
