import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { MeetingRepository } from './meeting.repository';
import { AgendaItemRepository } from './agenda-item.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${minutes} min` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * M3 Slice 12: system-design.md §9.1's "printable agenda". Server-side PDF
 * is a pinned stack layer (`CLAUDE.md` §3) but no specific library has been
 * chosen yet, and adding one isn't a call to make without asking (`CLAUDE.md`
 * §3: "before adding any dependency, ask"). This ships a self-contained,
 * print-ready HTML document instead — no new dependency, and every browser's
 * own "print to PDF" already turns this into the artifact the ship gate
 * actually needs. Swap to a real PDF renderer later without changing the
 * route's contract (still an agenda, still one meeting).
 */
@Controller('clubs/:clubUnitId/meetings/:meetingId/agenda/print')
export class AgendaPrintController {
  constructor(
    private readonly meetings: MeetingRepository,
    private readonly agendaItems: AgendaItemRepository,
  ) {}

  @Get()
  @ResourceScope('meeting.agenda_item', 'read', { source: 'param', key: 'clubUnitId' })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async print(
    @Param('clubUnitId', uuidPipe) clubUnitId: string,
    @Param('meetingId', uuidPipe) meetingId: string,
  ): Promise<string> {
    const meeting = await this.meetings.findById(meetingId);
    if (!meeting || meeting.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Meeting not found');
    }
    const items = await this.agendaItems.findByMeeting(meetingId);

    const rows = items
      .map(
        (item) => `
        <tr>
          <td class="pos">${item.position}</td>
          <td>${escapeHtml(item.title)}</td>
          <td>${item.roleKey ? escapeHtml(item.roleKey) : ''}</td>
          <td class="dur">${formatDuration(item.plannedDurationSeconds)}</td>
        </tr>`,
      )
      .join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Meeting Agenda</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 2rem auto; color: #111; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .meta { color: #555; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #ddd; }
  th { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em; color: #666; }
  .pos { width: 2rem; color: #888; }
  .dur { width: 5rem; text-align: right; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>Meeting Agenda</h1>
  <div class="meta">${escapeHtml(new Date(meeting.scheduledAt).toUTCString())}</div>
  <table>
    <thead><tr><th>#</th><th>Item</th><th>Role</th><th>Time</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  }
}
