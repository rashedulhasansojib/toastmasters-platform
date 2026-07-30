import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  EducationRecord,
  EducationRecordLevel,
  SpeechApprovalStatus,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { buildAutoStarts } from './education-record-starts';
import type { AutoRequestMeeting, AutoRequestSlot } from './speech-approval-requests';

type EducationRecordRow = Awaited<ReturnType<PrismaClient['educationRecord']['create']>>;
type PathwayProjectRow = Awaited<ReturnType<PrismaClient['pathwayProject']['findMany']>>[number];
type SpeechSlotRow = Awaited<ReturnType<PrismaClient['speechSlot']['findMany']>>[number];
/** Prisma's `TransactionClient` type — a callback tx or the top-level client both satisfy this. */
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0] | PrismaClient;

export interface LatestSlotForPerson {
  pathCode: string;
  pathName: string;
  projectCode: string;
  level: number;
}

/**
 * M11 Slice 3: the join key from a delivered slot to its `SpeechApproval`
 * status. Only the fields the confirm-guard needs are pulled — the projector
 * repository loads the full row for the roster.
 */
export interface SlotApproval {
  speechSlotId: string;
  status: SpeechApprovalStatus;
}

function toEducationRecord(row: EducationRecordRow): EducationRecord {
  return {
    id: row.id,
    personId: row.personId,
    clubUnitId: row.clubUnitId,
    pathCode: row.pathCode,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    credential: row.credential,
    levels: row.levels as unknown as EducationRecordLevel[],
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class EducationRecordRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    personId: string;
    clubUnitId: string;
    pathCode: string;
    startedAt?: Date;
    levels?: EducationRecordLevel[];
  }): Promise<EducationRecord> {
    const { levels = [], ...rest } = input;
    const row = await this.db.educationRecord.create({
      data: { ...rest, levels: levels as never },
    });
    return toEducationRecord(row);
  }

  /**
   * M12: the meeting-close auto-start hook, mirroring
   * `SpeechApprovalRepository.createManyForMeeting`'s shape exactly — a
   * thin adapter around the pure `buildAutoStarts`. Runs inside the
   * caller's transaction and relies on the `@@unique([personId,
   * clubUnitId, pathCode])` constraint for idempotence: a person who
   * already has a record for a path is skipped, never retroactively
   * backfilled, and re-closing a meeting inserts zero rows.
   */
  async ensureStartedForMeeting(
    tx: Tx,
    meeting: AutoRequestMeeting,
    meetingId: string,
  ): Promise<{ createdCount: number }> {
    const slots: AutoRequestSlot[] = await tx.speechSlot.findMany({
      where: { meetingId },
      select: {
        id: true,
        status: true,
        pathCode: true,
        projectCode: true,
        level: true,
        speakerPersonId: true,
        requestedBy: true,
      },
    });
    const starts = buildAutoStarts(meeting, slots);
    if (starts.length === 0) return { createdCount: 0 };

    const result = await tx.educationRecord.createMany({
      data: starts.map((s) => ({
        personId: s.personId,
        clubUnitId: s.clubUnitId,
        pathCode: s.pathCode,
        startedAt: s.startedAt,
        levels: s.levels as never,
      })),
      skipDuplicates: true,
    });
    return { createdCount: result.count };
  }

  /**
   * The person's most recently scheduled speech slot in the club, regardless
   * of delivery/approval status — what a VPE starting a path for them would
   * naturally pre-fill. Matches `speakerPersonId ?? requestedBy` the same
   * way `findDeliveredSlots` does.
   */
  async findLatestSlotForPerson(
    personId: string,
    clubUnitId: string,
  ): Promise<LatestSlotForPerson | null> {
    const slot = await this.db.speechSlot.findFirst({
      where: {
        meeting: { clubUnitId },
        OR: [{ speakerPersonId: personId }, { speakerPersonId: null, requestedBy: personId }],
      },
      orderBy: { meeting: { scheduledAt: 'desc' } },
      select: { pathCode: true, projectCode: true, level: true, path: { select: { name: true } } },
    });
    if (!slot) return null;
    return {
      pathCode: slot.pathCode,
      pathName: slot.path.name,
      projectCode: slot.projectCode,
      level: slot.level,
    };
  }

  async findById(id: string): Promise<EducationRecord | null> {
    const row = await this.db.educationRecord.findUnique({ where: { id } });
    return row ? toEducationRecord(row) : null;
  }

  async findByClub(clubUnitId: string, personId?: string): Promise<EducationRecord[]> {
    const rows = await this.db.educationRecord.findMany({
      where: { clubUnitId, ...(personId ? { personId } : {}) },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map(toEducationRecord);
  }

  /** `completion` is set only when the fifth level is confirmed — see EducationRecordService.confirmLevel. */
  async updateLevels(
    id: string,
    levels: EducationRecordLevel[],
    completion?: { completedAt: Date; credential: string },
  ): Promise<EducationRecord> {
    const row = await this.db.educationRecord.update({
      where: { id },
      data: { levels: levels as never, ...(completion ?? {}) },
    });
    return toEducationRecord(row);
  }

  /** The credential a path awards on completion — seeded reference data, never hardcoded (FR-EDU-1). */
  async findPathCredential(pathCode: string): Promise<string | null> {
    const path = await this.db.pathwayPath.findUnique({
      where: { pathCode },
      select: { credential: true },
    });
    return path?.credential ?? null;
  }

  async findByPersonAndClub(personId: string, clubUnitId: string): Promise<EducationRecord[]> {
    const rows = await this.db.educationRecord.findMany({ where: { personId, clubUnitId } });
    return rows.map(toEducationRecord);
  }

  /** Level-completion evidence — required projects and what the member has actually delivered (SpeechSlot.status='approved' on a closed meeting), never self-report (FR-EDU-2). */
  async findRequiredProjects(pathCode: string, level: number): Promise<PathwayProjectRow[]> {
    return this.db.pathwayProject.findMany({ where: { pathCode, level } });
  }

  async findDeliveredSlots(
    personId: string,
    pathCode: string,
    level: number,
  ): Promise<SpeechSlotRow[]> {
    return this.db.speechSlot.findMany({
      where: {
        pathCode,
        level,
        status: 'approved',
        meeting: { status: 'closed' },
        // M9 split "who filed the request" from "who speaks" — a VPE files
        // slots on other members' behalf. Credit the speaker, falling back to
        // the requester for the self-service case where they are the same
        // person. Matching the roster projection's rule keeps "3 of 3" on the
        // roster and a successful mark-complete in agreement.
        OR: [{ speakerPersonId: personId }, { speakerPersonId: null, requestedBy: personId }],
      },
    });
  }

  /**
   * M11 Slice 3: the VPE-approval status for a set of delivered slot ids.
   * `markLevelComplete` and `confirmLevel` gate on `status = 'approved'`;
   * a slot with no `SpeechApproval` row on file is grandfathered (its
   * delivery predates the M11 workflow) and simply isn't returned here.
   */
  async findApprovalsForSlots(slotIds: string[]): Promise<SlotApproval[]> {
    if (slotIds.length === 0) return [];
    const rows = await this.db.speechApproval.findMany({
      where: { speechSlotId: { in: slotIds } },
      select: { speechSlotId: true, status: true },
    });
    return rows.map((row) => ({ speechSlotId: row.speechSlotId, status: row.status }));
  }
}
