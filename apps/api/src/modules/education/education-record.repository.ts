import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { EducationRecord, EducationRecordLevel } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type EducationRecordRow = Awaited<ReturnType<PrismaClient['educationRecord']['create']>>;
type PathwayProjectRow = Awaited<ReturnType<PrismaClient['pathwayProject']['findMany']>>[number];
type SpeechSlotRow = Awaited<ReturnType<PrismaClient['speechSlot']['findMany']>>[number];

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
  }): Promise<EducationRecord> {
    const row = await this.db.educationRecord.create({ data: { ...input, levels: [] } });
    return toEducationRecord(row);
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
}
