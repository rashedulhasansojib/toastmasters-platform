import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateLibraryItemRequest,
  CreateGovernanceDocumentRequest,
  NewLibraryItemVersionRequest,
  LibraryItem,
  LibraryItemCategory,
} from '@toastmasters/contracts';
import { STORAGE_PORT, type StoragePort } from '../../common/storage/storage.port';
import { LibraryItemRepository } from './library-item.repository';

/**
 * M5 Slice 2: system-design.md §15. `LibraryItemController` (resource
 * `library.item`) and `GovernanceDocumentController` (resource
 * `library.governance_document`) both call this one service — the category
 * split lives in routing/authorization, not in two copies of this logic. See
 * the M5 plan doc's "two library resources, not one" note.
 */
@Injectable()
export class LibraryItemService {
  constructor(
    private readonly items: LibraryItemRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  signedUploadUrl(orgUnitId: string, contentType: string): Promise<{ url: string; key: string }> {
    const key = `library/${orgUnitId}/${randomUUID()}`;
    return this.storage.signedUploadUrl(key, contentType).then((url) => ({ url, key }));
  }

  async signedDownloadUrl(id: string): Promise<string> {
    const item = await this.items.findById(id);
    if (!item?.fileUrl) throw new NotFoundException('Library item has no file');
    return this.storage.signedDownloadUrl(item.fileUrl);
  }

  create(
    orgUnitId: string,
    uploadedBy: string,
    category: LibraryItemCategory,
    body: CreateLibraryItemRequest | CreateGovernanceDocumentRequest,
  ): Promise<LibraryItem> {
    return this.items.create({
      orgUnitId,
      uploadedBy,
      category,
      kind: body.kind,
      title: body.title,
      description: body.description,
      tags: body.tags,
      fileUrl: body.fileUrl,
      fileMimeType: body.fileMimeType,
      fileSizeBytes: body.fileSizeBytes,
      fileChecksum: body.fileChecksum,
      externalUrl: body.externalUrl,
      body: body.body,
      visibility: body.visibility,
      visibleToRoles: body.visibleToRoles,
      programYearId: body.programYearId,
      reviewBy: body.reviewBy ? new Date(body.reviewBy) : undefined,
    });
  }

  list(
    orgUnitId: string,
    category: LibraryItemCategory | 'not_governance',
    filter: { kind?: LibraryItem['kind']; tag?: string; pastReviewOnly?: boolean },
  ): Promise<LibraryItem[]> {
    return this.items.findByOrgUnit(orgUnitId, { category, ...filter });
  }

  /** Creates `v+1` with `supersedesId` back to the current row and flips the old row's `isCurrent` — governance docs are versioned, never overwritten (I-17). */
  async newVersion(
    orgUnitId: string,
    id: string,
    uploadedBy: string,
    body: NewLibraryItemVersionRequest,
  ): Promise<LibraryItem> {
    const current = await this.items.findById(id);
    if (!current || current.orgUnitId !== orgUnitId) {
      throw new BadRequestException('Library item not found');
    }
    if (!current.isCurrent) {
      throw new BadRequestException('Cannot version a superseded item — version the current one');
    }
    const next = await this.items.create({
      orgUnitId,
      uploadedBy,
      category: current.category,
      kind: current.kind,
      title: current.title,
      description: current.description ?? undefined,
      tags: current.tags,
      fileUrl: body.fileUrl ?? current.fileUrl ?? undefined,
      fileMimeType: body.fileMimeType ?? current.fileMimeType ?? undefined,
      fileSizeBytes: body.fileSizeBytes ?? current.fileSizeBytes ?? undefined,
      fileChecksum: body.fileChecksum ?? current.fileChecksum ?? undefined,
      externalUrl: body.externalUrl ?? current.externalUrl ?? undefined,
      body: body.body ?? current.body ?? undefined,
      visibility: current.visibility,
      visibleToRoles: current.visibleToRoles,
      programYearId: current.programYearId ?? undefined,
      reviewBy: body.reviewBy
        ? new Date(body.reviewBy)
        : current.reviewBy
          ? new Date(current.reviewBy)
          : undefined,
      supersedesId: current.id,
      version: current.version + 1,
    });
    await this.items.supersede(current.id);
    return next;
  }

  archive(id: string): Promise<LibraryItem> {
    return this.items.archive(id);
  }
}
