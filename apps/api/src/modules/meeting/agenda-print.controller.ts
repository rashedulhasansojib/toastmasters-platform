import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { MeetingRepository } from './meeting.repository';
import { SpeechSlotRepository } from './speech-slot.repository';
import { MeetingRoleAssignmentRepository } from './meeting-role-assignment.repository';
import { ClubMembershipRepository } from '../identity/club-membership.repository';
import { buildAgendaSchedule, type AgendaRow } from './agenda-schedule';

const uuidPipe = new ZodValidationPipe(z.uuid());

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRow(row: AgendaRow): string {
  const main = `
    <tr class="main">
      <td class="time">${escapeHtml(row.time)}</td>
      <td>${escapeHtml(row.label)}</td>
      <td class="person">${row.person ? escapeHtml(row.person) : ''}</td>
      <td class="dur">${row.minutes ?? ''}</td>
    </tr>`;

  const subs = (row.subRows ?? [])
    .map(
      (sub) => `
    <tr class="sub">
      <td class="time"></td>
      <td class="label${sub.italic ? ' italic' : ''}">${escapeHtml(sub.label)}</td>
      <td class="person">${sub.person ? escapeHtml(sub.person) : ''}</td>
      <td class="dur">${sub.minutes ?? ''}</td>
    </tr>`,
    )
    .join('');

  return main + subs;
}

/**
 * M3 Slice 12: system-design.md §9.1's "printable agenda". Server-side PDF
 * is a pinned stack layer (`CLAUDE.md` §3) but no specific library has been
 * chosen yet, and adding one isn't a call to make without asking. This ships
 * a self-contained, print-ready HTML document instead — every browser's own
 * "print to PDF" turns it into the artifact the ship gate needs.
 *
 * M9: the agenda is now **derived** from the roles and prepared speakers
 * (see `agenda-schedule.ts`), matching the legacy portal, rather than
 * transcribing hand-entered line items. The running order of a Toastmasters
 * meeting is fixed; only the people change.
 */
@Controller('clubs/:clubUnitId/meetings/:meetingId/agenda/print')
export class AgendaPrintController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly speechSlots: SpeechSlotRepository,
    private readonly roleAssignments: MeetingRoleAssignmentRepository,
    private readonly memberships: ClubMembershipRepository,
  ) {}

  @Get()
  @ResourceScope('meeting.speech_slot', 'read', { source: 'param', key: 'clubUnitId' })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async print(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<string> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }

    const [slots, assignments, members] = await Promise.all([
      this.speechSlots.findByMeeting(meetingId),
      this.roleAssignments.findByMeeting(meetingId),
      this.memberships.findActiveSummariesByClub(clubUnitId),
    ]);

    const nameById = new Map(members.map((m) => [m.personId, m.fullName]));
    const nameOf = (personId: string | null | undefined) =>
      personId ? (nameById.get(personId) ?? '—') : '—';

    const scheduled = new Date(meeting.scheduledAt);
    const startMinutes = scheduled.getUTCHours() * 60 + scheduled.getUTCMinutes();

    const rows = buildAgendaSchedule({
      startMinutes,
      roleAssignments: assignments,
      speechSlots: slots,
      nameOf,
    });

    const wordOfDay = meeting.wordOfDay;
    const topics = meeting.tableTopicQuestions ?? [];

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Meeting Agenda</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 760px; margin: 2rem auto; color: #111; }
  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.06em; color: #555; margin: 2rem 0 0.5rem; }
  .meta { color: #555; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; color: #666; }
  .time { width: 5.5rem; color: #444; white-space: nowrap; }
  .dur { width: 4.5rem; text-align: right; color: #666; white-space: nowrap; }
  .person { width: 12rem; }
  tr.main td { font-weight: 700; }
  tr.sub td { font-weight: 400; border-bottom: 1px dotted #eee; }
  tr.sub .label { padding-left: 1.6rem; }
  tr.sub .label.italic { font-style: italic; color: #666; }
  .wod { border: 1px solid #ddd; padding: 0.75rem 1rem; }
  .wod strong { font-size: 1.1rem; }
  ol { padding-left: 1.2rem; }
  @media print { body { margin: 0; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
</style>
</head>
<body>
  <h1>${escapeHtml(
    meeting.meetingNumber
      ? `Meeting #${meeting.meetingNumber}`
      : (meeting.title ?? 'Meeting Agenda'),
  )}</h1>
  <div class="meta">
    ${escapeHtml(scheduled.toUTCString())}
    ${meeting.venue ? ` &middot; ${escapeHtml(meeting.venue)}` : ''}
    ${meeting.theme ? `<br><em>Theme: ${escapeHtml(meeting.theme)}</em>` : ''}
  </div>

  <table>
    <thead><tr><th class="time">Time</th><th>Item</th><th class="person">Who</th><th class="dur">Mins</th></tr></thead>
    <tbody>${rows.map(renderRow).join('')}</tbody>
  </table>

  ${
    wordOfDay && wordOfDay.word
      ? `<h2>Word of the Day</h2>
  <div class="wod">
    <strong>${escapeHtml(wordOfDay.word)}</strong>${
      wordOfDay.partOfSpeech ? ` <em>(${escapeHtml(wordOfDay.partOfSpeech)})</em>` : ''
    }
    ${wordOfDay.meaning ? `<div>${escapeHtml(wordOfDay.meaning)}</div>` : ''}
    ${wordOfDay.example ? `<div><em>&ldquo;${escapeHtml(wordOfDay.example)}&rdquo;</em></div>` : ''}
  </div>`
      : ''
  }

  ${
    topics.length > 0
      ? `<h2>Table Topics</h2>
  <ol>${topics.map((t) => `<li>${escapeHtml(t.text)}</li>`).join('')}</ol>`
      : ''
  }
</body>
</html>`;
  }
}
