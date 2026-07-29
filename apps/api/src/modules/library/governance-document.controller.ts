import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createGovernanceDocumentRequestSchema,
  newLibraryItemVersionRequestSchema,
  librarySignedUploadUrlRequestSchema,
  libraryItemKind,
  type CreateGovernanceDocumentRequest,
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
 * M5 Slice 2: `library.governance_document` — versioned, never overwritten
 * (I-17). Same `LibraryItemService`/table as `LibraryItemController`; only
 * the authorization surface differs, per the M5 plan doc's split note.
 */
@Controller('clubs/:clubUnitId/governance-documents')
export class GovernanceDocumentController {
  constructor(private readonly items: LibraryItemService) {}

  @Post('upload-url')
  @ResourceScope('library.governance_document', 'create', { source: 'param', key: 'clubUnitId' })
  async uploadUrl(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(librarySignedUploadUrlRequestSchema))
    body: LibrarySignedUploadUrlRequest,
  ): Promise<LibrarySignedUploadUrlResponse> {
    return this.items.signedUploadUrl(clubUnitId, body.contentType);
  }

  @Post()
  @ResourceScope('library.governance_document', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createGovernanceDocumentRequestSchema))
    body: CreateGovernanceDocumentRequest,
  ): Promise<LibraryItem> {
    return this.items.create(clubUnitId, principal.userId, 'governance', body);
  }

  @Get()
  @ResourceScope('library.governance_document', 'read', { source: 'param', key: 'clubUnitId' })
  list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ): Promise<LibraryItem[]> {
    return this.items.list(clubUnitId, 'governance', {
      kind: query.kind,
      tag: query.tag,
      pastReviewOnly: query.pastReview === 'true',
    });
  }

  @Get(':id/download-url')
  @ResourceScope('library.governance_document', 'read', { source: 'param', key: 'clubUnitId' })
  async downloadUrl(@Param('id', uuidPipe) id: string): Promise<LibrarySignedDownloadUrlResponse> {
    return { url: await this.items.signedDownloadUrl(id) };
  }

  @Post(':id/new-version')
  @ResourceScope('library.governance_document', 'update', { source: 'param', key: 'clubUnitId' })
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
  @ResourceScope('library.governance_document', 'update', { source: 'param', key: 'clubUnitId' })
  archive(@Param('id', uuidPipe) id: string): Promise<LibraryItem> {
    return this.items.archive(id);
  }
}
