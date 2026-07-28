import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { SpeechSlot } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type SpeechSlotRow = Awaited<ReturnType<PrismaClient['speechSlot']['create']>>;

function toSpeechSlot(row: SpeechSlotRow): SpeechSlot {
  return {
    id: row.id,
    meetingId: row.meetingId,
    title: row.title,
    pathCode: row.pathCode,
    projectCode: row.projectCode,
    level: row.level,
    plannedDurationSeconds: row.plannedDurationSeconds,
    requestedBy: row.requestedBy,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class SpeechSlotRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /** Validates pathCode/projectCode against the seeded catalog and the requested duration against the project's bounds (system-design.md §9.1). `level` is derived from the matched project, never client-supplied. */
  async create(input: {
    meetingId: string;
    title: string;
    pathCode: string;
    projectCode: string;
    plannedDurationSeconds: number;
    requestedBy: string;
  }): Promise<SpeechSlot> {
    const project = await this.db.pathwayProject.findUnique({
      where: { pathCode_projectCode: { pathCode: input.pathCode, projectCode: input.projectCode } },
    });
    if (!project) {
      throw new BadRequestException(
        `Unknown project ${input.projectCode} on path ${input.pathCode}`,
      );
    }
    const minSeconds = project.minMinutes * 60;
    const maxSeconds = project.maxMinutes * 60;
    if (input.plannedDurationSeconds < minSeconds || input.plannedDurationSeconds > maxSeconds) {
      throw new BadRequestException(
        `${input.projectCode} must be between ${project.minMinutes} and ${project.maxMinutes} minutes`,
      );
    }

    const row = await this.db.speechSlot.create({
      data: {
        meetingId: input.meetingId,
        title: input.title,
        pathCode: input.pathCode,
        projectCode: input.projectCode,
        level: project.level,
        plannedDurationSeconds: input.plannedDurationSeconds,
        requestedBy: input.requestedBy,
      },
    });
    return toSpeechSlot(row);
  }

  async findByMeeting(meetingId: string): Promise<SpeechSlot[]> {
    const rows = await this.db.speechSlot.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toSpeechSlot);
  }

  async findById(id: string): Promise<SpeechSlot | null> {
    const row = await this.db.speechSlot.findUnique({ where: { id } });
    return row ? toSpeechSlot(row) : null;
  }

  async decide(id: string, status: 'approved' | 'declined'): Promise<SpeechSlot> {
    const row = await this.db.speechSlot.update({ where: { id }, data: { status } });
    return toSpeechSlot(row);
  }
}
