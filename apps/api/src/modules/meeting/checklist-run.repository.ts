import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ChecklistRun, ChecklistRunItem } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { ChecklistTemplateRepository } from './checklist-template.repository';

type ChecklistRunRow = Awaited<ReturnType<PrismaClient['checklistRun']['create']>>;

function toChecklistRun(row: ChecklistRunRow): ChecklistRun {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    templateId: row.templateId,
    meetingId: row.meetingId,
    items: row.items as unknown as ChecklistRunItem[],
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ChecklistRunRepository {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma(),
    private readonly templates: ChecklistTemplateRepository,
  ) {}

  /** Items are a snapshot off the template at creation time — later template edits never rewrite a started run. */
  async create(input: {
    orgUnitId: string;
    templateId: string;
    meetingId?: string;
  }): Promise<ChecklistRun> {
    const template = await this.templates.findById(input.templateId);
    if (!template) {
      throw new BadRequestException(`Unknown checklist template ${input.templateId}`);
    }
    const items: ChecklistRunItem[] = template.items.map((item) => ({
      key: item.key,
      label: item.label,
      phase: item.phase,
      done: false,
      doneBy: null,
      doneAt: null,
      note: null,
    }));
    const row = await this.db.checklistRun.create({
      data: {
        orgUnitId: input.orgUnitId,
        templateId: input.templateId,
        meetingId: input.meetingId ?? null,
        items,
      },
    });
    return toChecklistRun(row);
  }

  async findByMeeting(meetingId: string): Promise<ChecklistRun[]> {
    const rows = await this.db.checklistRun.findMany({
      where: { meetingId },
      orderBy: { startedAt: 'asc' },
    });
    return rows.map(toChecklistRun);
  }

  async findById(id: string): Promise<ChecklistRun | null> {
    const row = await this.db.checklistRun.findUnique({ where: { id } });
    return row ? toChecklistRun(row) : null;
  }

  /** `completedAt` is set the moment every item is done, cleared the moment one isn't — derived, never client-supplied. */
  async markItem(input: {
    id: string;
    key: string;
    done: boolean;
    note?: string | null;
    doneBy: string;
  }): Promise<ChecklistRun> {
    const existing = await this.db.checklistRun.findUniqueOrThrow({ where: { id: input.id } });
    const items = (existing.items as unknown as ChecklistRunItem[]).map((item) =>
      item.key === input.key
        ? {
            ...item,
            done: input.done,
            doneBy: input.done ? input.doneBy : null,
            doneAt: input.done ? new Date().toISOString() : null,
            note: input.note ?? item.note,
          }
        : item,
    );
    const completedAt = items.every((item) => item.done) ? new Date() : null;

    const row = await this.db.checklistRun.update({
      where: { id: input.id },
      data: { items, completedAt },
    });
    return toChecklistRun(row);
  }
}
