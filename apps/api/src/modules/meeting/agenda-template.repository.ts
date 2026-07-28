import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { AgendaTemplate, AgendaTemplateItem } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type AgendaTemplateRow = Awaited<ReturnType<PrismaClient['agendaTemplate']['create']>>;

function toAgendaTemplate(row: AgendaTemplateRow): AgendaTemplate {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    name: row.name,
    items: row.items as unknown as AgendaTemplateItem[],
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AgendaTemplateRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** `order` is server-assigned from array position — never client-supplied. */
  async create(input: {
    orgUnitId: string;
    name: string;
    items: Array<Omit<AgendaTemplateItem, 'order'>>;
  }): Promise<AgendaTemplate> {
    const items: AgendaTemplateItem[] = input.items.map((item, index) => ({
      ...item,
      order: index,
    }));
    const row = await this.db.agendaTemplate.create({
      data: { orgUnitId: input.orgUnitId, name: input.name, items: items as never },
    });
    return toAgendaTemplate(row);
  }

  async findByOrgUnit(orgUnitId: string): Promise<AgendaTemplate[]> {
    const rows = await this.db.agendaTemplate.findMany({
      where: { orgUnitId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toAgendaTemplate);
  }

  async findById(id: string): Promise<AgendaTemplate | null> {
    const row = await this.db.agendaTemplate.findUnique({ where: { id } });
    return row ? toAgendaTemplate(row) : null;
  }
}
