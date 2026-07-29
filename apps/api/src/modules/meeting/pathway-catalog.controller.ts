import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import type { PathwayPath } from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { SpeechSlotRepository } from './speech-slot.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M9: the seeded Pathways catalogue, read-only, so the agenda's Prepared
 * Speakers block can offer path/project pickers rather than the legacy
 * portal's free-text "Project / Path" and "Level" fields.
 *
 * Gated on `meeting.speech_slot: read` rather than a new resource: the
 * catalogue is non-sensitive seeded reference data whose only consumer is
 * the speech-slot form, so anyone who can see the slots can see the list
 * they were chosen from. Club-scoped in the URL purely so the standard
 * scope resolver applies.
 */
@Controller('clubs/:clubUnitId/pathways')
export class PathwayCatalogController {
  constructor(private readonly speechSlots: SpeechSlotRepository) {}

  @Get()
  @ResourceScope('meeting.speech_slot', 'read', { source: 'param', key: 'clubUnitId' })
  async list(@Param('clubUnitId', uuidPipe) _clubUnitId: string): Promise<PathwayPath[]> {
    return this.speechSlots.listPathways();
  }
}
