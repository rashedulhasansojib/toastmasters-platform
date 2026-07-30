import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import type { MembershipRosterEntry, SpeechHistoryEntry } from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { MemberHealthSignalRepository } from './member-health-signal.repository';
import { SpeechSlotRepository } from '../meeting/speech-slot.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * CLAUDE.md §2 decision 11 (2026-07-30): the VP Membership dashboard's
 * roster + per-member speech history. Both routes are gated on restricted
 * resources — `membership.health_signal` for the roster (email/phone/band
 * are VPM-only) and `meeting.speech_slot` for the drill-down — so a non-VPM
 * club role gets denied rather than a filtered/empty list.
 */
@Controller('clubs/:clubUnitId/membership')
export class MemberHealthController {
  constructor(
    private readonly healthSignals: MemberHealthSignalRepository,
    private readonly speechSlots: SpeechSlotRepository,
  ) {}

  @Get('roster')
  @ResourceScope('membership.health_signal', 'read', { source: 'param', key: 'clubUnitId' })
  roster(@Param('clubUnitId', uuidPipe) clubUnitId: string): Promise<MembershipRosterEntry[]> {
    return this.healthSignals.findRosterByClub(clubUnitId);
  }

  @Get(':personId/speech-history')
  @ResourceScope('meeting.speech_slot', 'read', { source: 'param', key: 'clubUnitId' })
  async speechHistory(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('personId', uuidPipe) personId: string,
  ): Promise<SpeechHistoryEntry[]> {
    const rows = await this.speechSlots.findDeliveredBySpeaker(clubUnitId, personId);
    return rows.map((row) => ({
      ...row,
      meetingScheduledAt: row.meetingScheduledAt.toISOString(),
    }));
  }
}
