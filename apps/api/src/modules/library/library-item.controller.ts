import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createLibraryItemRequestSchema,
  newLibraryItemVersionRequestSchema,
  librarySignedUploadUrlRequestSchema,
  libraryItemKind,
  type CreateLibraryItemRequest,
  type NewLibraryItemVersionRequest,
  type LibrarySignedUploadUrlRequest,
  type LibraryItem,
  type LibrarySignedUploadUrlResponse,
  type LibrarySignedDownloadUrlResponse,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { LibraryItemService } from './library-item.service';

const uuidPipe = new ZodValidationPipe(z.uuid());
const listQuerySchema = z.object({
  kind: libraryItemKind.optional(),
  tag: z.string().min(1).optional(),
  pastReview: z.enum(['true', 'false']).optional(),
});

/**
 * M5 Slice 2: `library.item` — media, links, notes, and non-governance
 * documents. Governance documents live under `GovernanceDocumentController`
 * (`library.governance_document`) instead — see the M5 plan doc.
 */
@Controller('clubs/:clubUnitId/library-items')
export class LibraryItemController {
  constructor(private readonly items: LibraryItemService) {}

  @Post('upload-url')
  @ResourceScope('library.item', 'create', { source: 'param', key: 'clubUnitId' })
  async uploadUrl(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(librarySignedUploadUrlRequestSchema))
    body: LibrarySignedUploadUrlRequest,
  ): Promise<LibrarySignedUploadUrlResponse> {
    return this.items.signedUploadUrl(clubUnitId, body.contentType);
  }

  @Post()
  @ResourceScope('library.item', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createLibraryItemRequestSchema)) body: CreateLibraryItemRequest,
  ): Promise<LibraryItem> {
    if (body.category === 'governance') {
      throw new BadRequestException('Governance documents are created via /governance-documents');
    }
    return this.items.create(clubUnitId, principal.userId, body.category, body);
  }

  @Get()
  @ResourceScope('library.item', 'read', { source: 'param', key: 'clubUnitId' })
  list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ): Promise<LibraryItem[]> {
    return this.items.list(clubUnitId, 'not_governance', {
      kind: query.kind,
      tag: query.tag,
      pastReviewOnly: query.pastReview === 'true',
    });
  }

  @Get(':id/download-url')
  @ResourceScope('library.item', 'read', { source: 'param', key: 'clubUnitId' })
  async downloadUrl(@Param('id', uuidPipe) id: string): Promise<LibrarySignedDownloadUrlResponse> {
    return { url: await this.items.signedDownloadUrl(id) };
  }

  @Post(':id/new-version')
  @ResourceScope('library.item', 'update', { source: 'param', key: 'clubUnitId' })
  newVersion(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(newLibraryItemVersionRequestSchema))
    body: NewLibraryItemVersionRequest,
  ): Promise<LibraryItem> {
    return this.items.newVersion(clubUnitId, id, principal.userId, body);
  }

  @Post(':id/archive')
  @ResourceScope('library.item', 'update', { source: 'param', key: 'clubUnitId' })
  archive(@Param('id', uuidPipe) id: string): Promise<LibraryItem> {
    return this.items.archive(id);
  }
}
