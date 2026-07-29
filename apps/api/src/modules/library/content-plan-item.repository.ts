import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  ContentPlanItem,
  ContentPlanChannel,
  ContentPlanStatus,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type ContentPlanItemRow = Awaited<ReturnType<PrismaClient['contentPlanItem']['create']>>;

function toContentPlanItem(row: ContentPlanItemRow): ContentPlanItem {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    programYearId: row.programYearId,
    title: row.title,
    channel: row.channel,
    scheduledFor: row.scheduledFor.toISOString(),
    status: row.status,
    copy: row.copy,
    assetIds: row.assetIds,
    linkedMeetingId: row.linkedMeetingId,
    assignedToPersonId: row.assignedToPersonId,
    publishedUrl: row.publishedUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    leadSourceTag: row.leadSourceTag,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ContentPlanItemRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    programYearId: string;
    title: string;
    channel: ContentPlanChannel;
    scheduledFor: Date;
    copy?: string;
    assetIds: string[];
    linkedMeetingId?: string;
    assignedToPersonId?: string;
    leadSourceTag?: string;
  }): Promise<ContentPlanItem> {
    const row = await this.db.contentPlanItem.create({ data: input });
    return toContentPlanItem(row);
  }

  async findById(id: string): Promise<ContentPlanItem | null> {
    const row = await this.db.contentPlanItem.findUnique({ where: { id } });
    return row ? toContentPlanItem(row) : null;
  }

  async findByOrgUnit(
    orgUnitId: string,
    filter: { status?: ContentPlanStatus; channel?: ContentPlanChannel },
  ): Promise<ContentPlanItem[]> {
    const rows = await this.db.contentPlanItem.findMany({
      where: {
        orgUnitId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.channel ? { channel: filter.channel } : {}),
      },
      orderBy: { scheduledFor: 'asc' },
    });
    return rows.map(toContentPlanItem);
  }

  async update(
    id: string,
    input: Partial<{
      title: string;
      status: ContentPlanStatus;
      copy: string;
      assetIds: string[];
      scheduledFor: Date;
      assignedToPersonId: string;
    }>,
  ): Promise<ContentPlanItem> {
    const row = await this.db.contentPlanItem.update({ where: { id }, data: input });
    return toContentPlanItem(row);
  }

  /** `publish` only records the URL a human posted by hand — never calls a social API (N5). */
  async markPublished(id: string, publishedUrl: string): Promise<ContentPlanItem> {
    const row = await this.db.contentPlanItem.update({
      where: { id },
      data: { status: 'published', publishedUrl, publishedAt: new Date() },
    });
    return toContentPlanItem(row);
  }
}
