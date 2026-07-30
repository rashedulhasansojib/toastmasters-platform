import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { RoleTemplateSummary } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type RoleTemplateRow = Awaited<ReturnType<PrismaClient['roleTemplate']['findMany']>>[number];

function toSummary(row: RoleTemplateRow): RoleTemplateSummary {
  return {
    role: row.role,
    tier: row.tier,
    unitTypes: row.unitTypes as RoleTemplateSummary['unitTypes'],
    isSingleton: row.isSingleton,
    label: row.label,
  };
}

/**
 * The Users admin role picker's catalogue — read-only over the seeded
 * `role_template` table (CLAUDE.md §4: reference data, not a hardcoded
 * union). No `@ResourceScope` on the route this backs — every authenticated
 * person may see the list of role names that exist, same posture as
 * `support.profile`'s self-service routes; nothing here is per-person data.
 */
@Injectable()
export class RoleTemplateRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async findAll(): Promise<RoleTemplateSummary[]> {
    const rows = await this.db.roleTemplate.findMany({ orderBy: { role: 'asc' } });
    return rows.map(toSummary);
  }

  async findByRole(role: string): Promise<RoleTemplateSummary | null> {
    const row = await this.db.roleTemplate.findUnique({ where: { role } });
    return row ? toSummary(row) : null;
  }
}
