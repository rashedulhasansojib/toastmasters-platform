import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { PathwayPath, SpeechSlot } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type SpeechSlotRow = Awaited<ReturnType<PrismaClient['speechSlot']['create']>>;

function toSpeechSlot(row: SpeechSlotRow): SpeechSlot {
  return {
    id: row.id,
    meetingId: row.meetingId,
    position: row.position,
    title: row.title,
    pathCode: row.pathCode,
    projectCode: row.projectCode,
    level: row.level,
    plannedDurationSeconds: row.plannedDurationSeconds,
    requestedBy: row.requestedBy,
    speakerPersonId: row.speakerPersonId,
    evaluatorPersonId: row.evaluatorPersonId,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class SpeechSlotRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /**
   * Resolves the project against the seeded catalogue and checks the
   * duration against its bounds (system-design.md §9.1). `level` is derived
   * from the matched project, never client-supplied.
   */
  private async resolveProject(pathCode: string, projectCode: string, durationSeconds: number) {
    const project = await this.db.pathwayProject.findUnique({
      where: { pathCode_projectCode: { pathCode, projectCode } },
    });
    if (!project) {
      throw new BadRequestException(`Unknown project ${projectCode} on path ${pathCode}`);
    }
    const minSeconds = project.minMinutes * 60;
    const maxSeconds = project.maxMinutes * 60;
    if (durationSeconds < minSeconds || durationSeconds > maxSeconds) {
      throw new BadRequestException(
        `${projectCode} must be between ${project.minMinutes} and ${project.maxMinutes} minutes`,
      );
    }
    return project;
  }

  async create(input: {
    meetingId: string;
    title: string;
    pathCode: string;
    projectCode: string;
    plannedDurationSeconds: number;
    requestedBy: string;
    speakerPersonId?: string;
    evaluatorPersonId?: string;
    notes?: string;
  }): Promise<SpeechSlot> {
    const project = await this.resolveProject(
      input.pathCode,
      input.projectCode,
      input.plannedDurationSeconds,
    );

    // Position is server-assigned (max + 1) inside the same transaction that
    // reads it, so two concurrent adds can't land on the same slot number.
    const row = await this.db.$transaction(async (tx) => {
      const last = await tx.speechSlot.findFirst({
        where: { meetingId: input.meetingId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      return tx.speechSlot.create({
        data: {
          meetingId: input.meetingId,
          position: (last?.position ?? 0) + 1,
          title: input.title,
          pathCode: input.pathCode,
          projectCode: input.projectCode,
          level: project.level,
          plannedDurationSeconds: input.plannedDurationSeconds,
          requestedBy: input.requestedBy,
          speakerPersonId: input.speakerPersonId ?? null,
          evaluatorPersonId: input.evaluatorPersonId ?? null,
          notes: input.notes ?? null,
        },
      });
    });
    return toSpeechSlot(row);
  }

  /**
   * Edit a slot from the agenda. Changing the path/project or the duration
   * re-runs the same catalogue validation as create, and re-derives `level`
   * — so a slot can never drift into a level its project doesn't have.
   */
  async update(
    id: string,
    patch: {
      title?: string;
      pathCode?: string;
      projectCode?: string;
      plannedDurationSeconds?: number;
      speakerPersonId?: string | null;
      evaluatorPersonId?: string | null;
      notes?: string | null;
      position?: number;
    },
  ): Promise<SpeechSlot> {
    const current = await this.db.speechSlot.findUnique({ where: { id } });
    if (!current) throw new BadRequestException('Speech slot not found');

    const pathCode = patch.pathCode ?? current.pathCode;
    const projectCode = patch.projectCode ?? current.projectCode;
    const duration = patch.plannedDurationSeconds ?? current.plannedDurationSeconds;

    const revalidate =
      patch.pathCode !== undefined ||
      patch.projectCode !== undefined ||
      patch.plannedDurationSeconds !== undefined;
    const project = revalidate ? await this.resolveProject(pathCode, projectCode, duration) : null;

    const row = await this.db.speechSlot.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(revalidate
          ? { pathCode, projectCode, plannedDurationSeconds: duration, level: project!.level }
          : {}),
        ...(patch.speakerPersonId !== undefined ? { speakerPersonId: patch.speakerPersonId } : {}),
        ...(patch.evaluatorPersonId !== undefined
          ? { evaluatorPersonId: patch.evaluatorPersonId }
          : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
      },
    });
    return toSpeechSlot(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.speechSlot.delete({ where: { id } });
  }

  async findByMeeting(meetingId: string): Promise<SpeechSlot[]> {
    const rows = await this.db.speechSlot.findMany({
      where: { meetingId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
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

  /**
   * VP Membership dashboard's per-member speech-history drill-down
   * (CLAUDE.md §2 decision 11): every approved, already-delivered slot
   * where this person spoke, across every meeting in the club, newest
   * first.
   */
  async findDeliveredBySpeaker(
    clubUnitId: string,
    personId: string,
  ): Promise<
    Array<{
      speechSlotId: string;
      meetingId: string;
      meetingScheduledAt: Date;
      title: string;
      pathCode: string;
      projectCode: string;
      level: number;
      evaluatorPersonId: string | null;
      evaluatorFullName: string | null;
    }>
  > {
    const rows = await this.db.speechSlot.findMany({
      where: {
        speakerPersonId: personId,
        status: 'approved',
        meeting: { clubUnitId, scheduledAt: { lte: new Date() } },
      },
      select: {
        id: true,
        meetingId: true,
        title: true,
        pathCode: true,
        projectCode: true,
        level: true,
        evaluatorPersonId: true,
        evaluatorPerson: { select: { fullName: true } },
        meeting: { select: { scheduledAt: true } },
      },
      orderBy: { meeting: { scheduledAt: 'desc' } },
    });
    return rows.map((row) => ({
      speechSlotId: row.id,
      meetingId: row.meetingId,
      meetingScheduledAt: row.meeting.scheduledAt,
      title: row.title,
      pathCode: row.pathCode,
      projectCode: row.projectCode,
      level: row.level,
      evaluatorPersonId: row.evaluatorPersonId,
      evaluatorFullName: row.evaluatorPerson?.fullName ?? null,
    }));
  }

  /** The seeded Pathways catalogue, for the agenda's path/project pickers. */
  async listPathways(): Promise<PathwayPath[]> {
    const paths = await this.db.pathwayPath.findMany({
      where: { isActive: true },
      select: {
        pathCode: true,
        name: true,
        credential: true,
        projects: {
          select: {
            projectCode: true,
            name: true,
            level: true,
            minMinutes: true,
            maxMinutes: true,
            isRequired: true,
          },
          orderBy: [{ level: 'asc' }, { projectCode: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });
    return paths;
  }
}
