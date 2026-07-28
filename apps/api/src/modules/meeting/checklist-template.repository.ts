import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ChecklistTemplate, ChecklistTemplateItem } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type ChecklistTemplateRow = Awaited<ReturnType<PrismaClient['checklistTemplate']['create']>>;

function toChecklistTemplate(row: ChecklistTemplateRow): ChecklistTemplate {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    name: row.name,
    appliesTo: row.appliesTo,
    items: row.items as unknown as ChecklistTemplateItem[],
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ChecklistTemplateRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** `order` is server-assigned from array position — never client-supplied. */
  async create(input: {
    orgUnitId: string;
    name: string;
    appliesTo: ChecklistTemplate['appliesTo'];
    items: Array<Omit<ChecklistTemplateItem, 'order'>>;
  }): Promise<ChecklistTemplate> {
    const items: ChecklistTemplateItem[] = input.items.map((item, index) => ({
      ...item,
      order: index,
    }));
    const row = await this.db.checklistTemplate.create({
      data: {
        orgUnitId: input.orgUnitId,
        name: input.name,
        appliesTo: input.appliesTo,
        items,
      },
    });
    return toChecklistTemplate(row);
  }

  async findByOrgUnit(orgUnitId: string): Promise<ChecklistTemplate[]> {
    const rows = await this.db.checklistTemplate.findMany({
      where: { orgUnitId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toChecklistTemplate);
  }

  async findById(id: string): Promise<ChecklistTemplate | null> {
    const row = await this.db.checklistTemplate.findUnique({ where: { id } });
    return row ? toChecklistTemplate(row) : null;
  }
}
