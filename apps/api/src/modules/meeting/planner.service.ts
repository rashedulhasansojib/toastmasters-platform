import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  MeetingRoleKey,
  PlannerImportRequest,
  PlannerImportResult,
  PlannerRow,
  PlannerUnresolvedName,
} from '@toastmasters/contracts';
import { ProgramYearRepository } from '../identity/program-year.repository';
import { PlannerRepository, type PlannerCandidate } from './planner.repository';

/** Case-, punctuation- and whitespace-insensitive, so "de Silva" matches "De  Silva". */
function normalise(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.,'’-]/g, '')
    .replace(/\s+/g, ' ');
}

type Resolution =
  { kind: 'match'; personId: string } | { kind: 'no_match' } | { kind: 'ambiguous' };

/**
 * FR-MTG-5 / system-design.md §9.2. The planner reads through to role
 * assignments and the importer resolves typed names to people, leaving
 * anything it cannot place on a pending list for a human.
 */
@Injectable()
export class PlannerService {
  constructor(
    private readonly planner: PlannerRepository,
    private readonly programYears: ProgramYearRepository,
  ) {}

  list(clubUnitId: string, from: Date, to: Date): Promise<PlannerRow[]> {
    return this.planner.grid(clubUnitId, from, to);
  }

  /**
   * An index of active members by normalised name. A name held by two members
   * maps to `ambiguous` rather than to either of them — §9.2's "a name string
   * cannot distinguish three members called Rahim" is the whole reason the
   * planner stores person ids and not strings, so guessing here would
   * reintroduce exactly the bug the model exists to prevent.
   */
  private index(candidates: PlannerCandidate[]): Map<string, Resolution> {
    const byName = new Map<string, Resolution>();
    for (const candidate of candidates) {
      const key = normalise(candidate.fullName);
      const seen = byName.get(key);
      if (!seen) {
        byName.set(key, { kind: 'match', personId: candidate.personId });
      } else if (seen.kind === 'match' && seen.personId !== candidate.personId) {
        byName.set(key, { kind: 'ambiguous' });
      }
    }
    return byName;
  }

  /**
   * Commits everything resolvable and returns the rest. Deliberately not
   * all-or-nothing: a season sheet with two typos should still import the
   * other fifty rows, or nobody will use it.
   */
  async import(
    clubUnitId: string,
    body: PlannerImportRequest,
    actorPersonId: string,
  ): Promise<PlannerImportResult> {
    const programYear = await this.programYears.findCurrent();
    if (!programYear) {
      throw new BadRequestException('No current program year — cannot schedule meetings.');
    }

    const index = this.index(await this.planner.candidates(clubUnitId));
    const instants = body.rows.map((r) => new Date(r.scheduledAt));
    const existing = await this.planner.findByScheduledAt(clubUnitId, instants);

    const unresolved: PlannerUnresolvedName[] = [];
    const pending: Array<{
      meetingId: string;
      roleKey: MeetingRoleKey;
      slotIndex: number | null;
      personId: string;
    }> = [];

    let meetingsCreated = 0;
    let meetingsMatched = 0;

    for (const [rowIndex, row] of body.rows.entries()) {
      const scheduledAt = new Date(row.scheduledAt);
      const already = existing.get(scheduledAt.getTime());

      let meetingId: string;
      if (already) {
        meetingId = already.id;
        meetingsMatched += 1;
        if (row.theme) await this.planner.setMeetingTheme(meetingId, row.theme);
      } else {
        const created = await this.planner.createMeeting({
          clubUnitId,
          programYearId: programYear.id,
          scheduledAt,
          theme: row.theme,
          createdBy: actorPersonId,
        });
        meetingId = created.id;
        meetingsCreated += 1;
        // A second row for the same date in one sheet must reuse the meeting.
        existing.set(scheduledAt.getTime(), { id: meetingId });
      }

      for (const cell of row.cells) {
        const resolution = index.get(normalise(cell.name)) ?? { kind: 'no_match' as const };
        if (resolution.kind !== 'match') {
          unresolved.push({
            rowIndex,
            scheduledAt: scheduledAt.toISOString(),
            roleKey: cell.roleKey,
            slotIndex: cell.slotIndex ?? null,
            name: cell.name,
            reason: resolution.kind,
          });
          continue;
        }
        pending.push({
          meetingId,
          roleKey: cell.roleKey,
          slotIndex: cell.slotIndex ?? null,
          personId: resolution.personId,
        });
      }
    }

    // Never overwrite a slot somebody already filled by hand — the sheet is a
    // plan, and the app is the record. Skipped rows are counted, not silent.
    const taken = await this.planner.existingSlots([...new Set(pending.map((p) => p.meetingId))]);
    const fresh = pending.filter(
      (p) => !taken.has(`${p.meetingId}:${p.roleKey}:${p.slotIndex ?? 'null'}`),
    );

    const assignmentsCreated = await this.planner.createAssignments(fresh);

    return {
      meetingsCreated,
      meetingsMatched,
      assignmentsCreated,
      assignmentsSkipped: pending.length - assignmentsCreated,
      unresolved,
    };
  }
}
