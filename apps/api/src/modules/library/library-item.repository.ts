import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  LibraryItem,
  LibraryItemKind,
  LibraryItemCategory,
  LibraryItemVisibility,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type LibraryItemRow = Awaited<ReturnType<PrismaClient['libraryItem']['create']>>;

function toLibraryItem(row: LibraryItemRow): LibraryItem {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    kind: row.kind,
    title: row.title,
    description: row.description,
    tags: row.tags,
    category: row.category,
    fileUrl: row.fileUrl,
    fileMimeType: row.fileMimeType,
    fileSizeBytes: row.fileSizeBytes,
    fileChecksum: row.fileChecksum,
    externalUrl: row.externalUrl,
    body: row.body,
    visibility: row.visibility,
    visibleToRoles: row.visibleToRoles,
    version: row.version,
    supersedesId: row.supersedesId,
    isCurrent: row.isCurrent,
    programYearId: row.programYearId,
    reviewBy: row.reviewBy ? row.reviewBy.toISOString().slice(0, 10) : null,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class LibraryItemRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    kind: LibraryItemKind;
    title: string;
    description?: string;
    tags: string[];
    category: LibraryItemCategory;
    fileUrl?: string;
    fileMimeType?: string;
    fileSizeBytes?: number;
    fileChecksum?: string;
    externalUrl?: string;
    body?: string;
    visibility: LibraryItemVisibility;
    visibleToRoles: string[];
    programYearId?: string;
    reviewBy?: Date;
    uploadedBy: string;
    supersedesId?: string;
    version?: number;
  }): Promise<LibraryItem> {
    const row = await this.db.libraryItem.create({ data: input });
    return toLibraryItem(row);
  }

  async findById(id: string): Promise<LibraryItem | null> {
    const row = await this.db.libraryItem.findUnique({ where: { id } });
    return row ? toLibraryItem(row) : null;
  }

  async findByOrgUnit(
    orgUnitId: string,
    filter: {
      category: LibraryItemCategory | 'not_governance';
      kind?: LibraryItemKind;
      tag?: string;
      pastReviewOnly?: boolean;
    },
  ): Promise<LibraryItem[]> {
    const rows = await this.db.libraryItem.findMany({
      where: {
        orgUnitId,
        isCurrent: true,
        category: filter.category === 'not_governance' ? { not: 'governance' } : filter.category,
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.tag ? { tags: { has: filter.tag } } : {}),
        ...(filter.pastReviewOnly ? { reviewBy: { lt: new Date() } } : {}),
      },
      orderBy: { uploadedAt: 'desc' },
    });
    return rows.map(toLibraryItem);
  }

  async supersede(id: string): Promise<void> {
    await this.db.libraryItem.update({ where: { id }, data: { isCurrent: false } });
  }

  async archive(id: string): Promise<LibraryItem> {
    const row = await this.db.libraryItem.update({
      where: { id },
      data: { archivedAt: new Date(), isCurrent: false },
    });
    return toLibraryItem(row);
  }
}
