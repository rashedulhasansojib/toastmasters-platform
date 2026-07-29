import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Minutes, MinutesVisibility } from '@toastmasters/contracts';
import { LibraryItemService } from '../library/library-item.service';
import { MinutesRepository } from './minutes.repository';
import { ExComMeetingRepository } from './excom-meeting.repository';
import { MotionRepository } from './motion.repository';

/**
 * M8 Slice 3: system-design.md §13.3, FR-GOV-3/4/5. "Minutes draft
 * themselves" — the Secretary's job becomes discussion narrative, not
 * transcription. Approved minutes are immutable; a correction is a new
 * version. Publishing lands the minutes in the library automatically as a
 * governance document, reusing M5's `LibraryItemService` rather than a
 * parallel store.
 */
@Injectable()
export class MinutesService {
  constructor(
    private readonly minutes: MinutesRepository,
    private readonly excomMeetings: ExComMeetingRepository,
    private readonly motions: MotionRepository,
    private readonly libraryItems: LibraryItemService,
  ) {}

  /** Auto-seeds `body` from the ExCom meeting's own agenda, attendees, quorum, and motion outcomes. */
  async draftFromExCom(
    orgUnitId: string,
    excomMeetingId: string,
    programYearId: string,
    visibility: MinutesVisibility,
    draftedBy: string,
  ): Promise<Minutes> {
    const meeting = await this.excomMeetings.findById(excomMeetingId);
    if (!meeting) throw new NotFoundException('ExCom meeting not found');
    const meetingMotions = await this.motions.findByMeeting(excomMeetingId);

    const attendeeLines = meeting.attendees
      .map(
        (a) => `- ${a.personId}: ${a.present ? 'present' : a.apologies ? 'apologies' : 'absent'}`,
      )
      .join('\n');
    const agendaLines = meeting.agenda.map((a) => `${a.order}. ${a.title}`).join('\n');
    const motionLines = meetingMotions
      .map((m) => `Motion ${m.seq}: "${m.text}" — ${m.outcome}`)
      .join('\n');

    const body = [
      `ExCom meeting at ${meeting.location} on ${meeting.heldAt}`,
      `Quorum (${meeting.quorumRule}): ${meeting.quorumMet ? 'met' : 'not met'}`,
      '',
      'Attendees:',
      attendeeLines || '(none recorded)',
      '',
      'Agenda:',
      agendaLines || '(none recorded)',
      '',
      'Motions:',
      motionLines || '(none)',
    ].join('\n');

    return this.minutes.create({
      orgUnitId,
      programYearId,
      sourceKind: 'excom',
      excomMeetingId,
      draftedBy,
      body,
      visibility,
    });
  }

  list(orgUnitId: string): Promise<Minutes[]> {
    return this.minutes.findByClub(orgUnitId);
  }

  approve(id: string, approvedByPersonId: string): Promise<Minutes> {
    return this.minutes.approve(id, approvedByPersonId);
  }

  /** FR-GOV-5: publishing is a consequence of approval, not a separate filing chore. */
  async publish(id: string, publishedBy: string): Promise<Minutes> {
    const record = await this.minutes.findById(id);
    if (!record) throw new NotFoundException('Minutes not found');
    if (!record.approvedAt)
      throw new BadRequestException('Minutes must be approved before publishing');

    const libraryItem = await this.libraryItems.create(
      record.orgUnitId,
      publishedBy,
      'governance',
      {
        kind: 'document',
        title: `Minutes — ${record.draftedAt.slice(0, 10)}`,
        tags: ['minutes'],
        body: record.body,
        visibility:
          record.visibility === 'public'
            ? 'public'
            : record.visibility === 'members'
              ? 'members'
              : 'officers',
        visibleToRoles: [],
      },
    );
    return this.minutes.publish(id, libraryItem.id);
  }

  /** A correction is a new version — the approved row is never edited (I-17-style versioning, same pattern as governance documents). */
  async newVersion(id: string, body: string, draftedBy: string): Promise<Minutes> {
    const current = await this.minutes.findById(id);
    if (!current) throw new NotFoundException('Minutes not found');
    return this.minutes.create({
      orgUnitId: current.orgUnitId,
      programYearId: current.programYearId,
      sourceKind: current.sourceKind,
      excomMeetingId: current.excomMeetingId ?? undefined,
      clubMeetingId: current.clubMeetingId ?? undefined,
      draftedBy,
      body,
      visibility: current.visibility,
      supersedesId: current.id,
      version: current.version + 1,
    });
  }
}
