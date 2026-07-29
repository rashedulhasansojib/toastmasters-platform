import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createContentPlanItemRequestSchema,
  updateContentPlanItemRequestSchema,
  publishContentPlanItemRequestSchema,
  contentPlanChannel,
  contentPlanStatus,
  type CreateContentPlanItemRequest,
  type UpdateContentPlanItemRequest,
  type PublishContentPlanItemRequest,
  type ContentPlanItem,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { ContentPlanItemRepository } from './content-plan-item.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());
const listQuerySchema = z.object({
  status: contentPlanStatus.optional(),
  channel: contentPlanChannel.optional(),
});

/** M5 Slice 4: system-design.md §15.4. Plans and records only — `publish` never calls a social API (N5). */
@Controller('clubs/:clubUnitId/content-plan')
export class ContentPlanItemController {
  constructor(private readonly items: ContentPlanItemRepository) {}

  @Post()
  @ResourceScope('library.content_plan', 'create', { source: 'param', key: 'clubUnitId' })
  create(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Body(new ZodValidationPipe(createContentPlanItemRequestSchema))
    body: CreateContentPlanItemRequest,
  ): Promise<ContentPlanItem> {
    return this.items.create({
      orgUnitId: clubUnitId,
      programYearId: body.programYearId,
      title: body.title,
      channel: body.channel,
      scheduledFor: new Date(body.scheduledFor),
      copy: body.copy,
      assetIds: body.assetIds,
      linkedMeetingId: body.linkedMeetingId,
      assignedToPersonId: body.assignedToPersonId,
      leadSourceTag: body.leadSourceTag,
    });
  }

  @Get()
  @ResourceScope('library.content_plan', 'read', { source: 'param', key: 'clubUnitId' })
  list(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: z.infer<typeof listQuerySchema>,
  ): Promise<ContentPlanItem[]> {
    return this.items.findByOrgUnit(clubUnitId, query);
  }

  @Patch(':id')
  @ResourceScope('library.content_plan', 'update', { source: 'param', key: 'clubUnitId' })
  update(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(updateContentPlanItemRequestSchema))
    body: UpdateContentPlanItemRequest,
  ): Promise<ContentPlanItem> {
    return this.items.update(id, {
      ...body,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : undefined,
    });
  }

  @Post(':id/publish')
  @ResourceScope('library.content_plan', 'update', { source: 'param', key: 'clubUnitId' })
  publish(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(publishContentPlanItemRequestSchema))
    body: PublishContentPlanItemRequest,
  ): Promise<ContentPlanItem> {
    return this.items.markPublished(id, body.publishedUrl);
  }
}
