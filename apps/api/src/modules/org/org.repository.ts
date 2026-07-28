import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { OrgUnit, OrgUnitType } from '@toastmasters/contracts';
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
