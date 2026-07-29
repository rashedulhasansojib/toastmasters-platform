import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import type {
  ProgressApproval,
  ProgressDelivery,
  ProgressMember,
  ProgressProject,
  ProgressRecord,
} from './club-education-progress';

/**
 * M10: the four reads behind the club education roster.
 *
 * Deliveries are counted from the same evidence `markLevelComplete` gates on
 * — an `approved` speech slot on a `closed` meeting (FR-EDU-2) — so a member
 * who reads "3 of 3" on the roster can actually mark that level complete.
 * Delivery is credited to `speakerPersonId`, falling back to `requestedBy`
 * for the self-service case where the requester speaks.
 */
@Injectable()
export class EducationProgressRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async findClubMembers(clubUnitId: string): Promise<ProgressMember[]> {
    const rows = await this.db.clubMembership.findMany({
      where: { clubUnitId, leftAt: null },
      select: { personId: true, person: { select: { fullName: true } } },
      orderBy: { person: { fullName: 'asc' } },
    });
    return rows.map((row) => ({ personId: row.personId, fullName: row.person.fullName }));
  }

  async findClubRecords(clubUnitId: string): Promise<ProgressRecord[]> {
    const rows = await this.db.educationRecord.findMany({
      where: { clubUnitId },
      select: {
        id: true,
        personId: true,
        pathCode: true,
        startedAt: true,
        completedAt: true,
        credential: true,
        levels: true,
        path: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      personId: row.personId,
      pathCode: row.pathCode,
      pathName: row.path.name,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      credential: row.credential,
      levels: row.levels as unknown as ProgressRecord['levels'],
    }));
  }

  /** The whole catalogue — it is a few hundred rows of seeded reference data, not a per-club read. */
  async findCatalogProjects(): Promise<ProgressProject[]> {
    return this.db.pathwayProject.findMany({
      select: { pathCode: true, projectCode: true, level: true },
    });
  }

  async findDeliveries(personIds: string[]): Promise<ProgressDelivery[]> {
    if (personIds.length === 0) return [];
    const rows = await this.db.speechSlot.findMany({
      where: {
        status: 'approved',
        meeting: { status: 'closed' },
        OR: [
          { speakerPersonId: { in: personIds } },
          { speakerPersonId: null, requestedBy: { in: personIds } },
        ],
      },
      select: {
        id: true,
        title: true,
        pathCode: true,
        projectCode: true,
        speakerPersonId: true,
        requestedBy: true,
        meeting: { select: { scheduledAt: true } },
      },
    });
    return rows.map((row) => ({
      personId: row.speakerPersonId ?? row.requestedBy,
      pathCode: row.pathCode,
      projectCode: row.projectCode,
      speechTitle: row.title,
      // The meeting's scheduled instant stands in for the delivery date: the
      // meeting is `closed`, so `scheduledAt` is when it happened, not a
      // future intent.
      deliveredAt: row.meeting.scheduledAt,
      speechSlotId: row.id,
    }));
  }

  /**
   * M11 Slice 2: the club's approvals, projected to just the fields the
   * roster needs. Kept here (not on `SpeechApprovalRepository.listForClub`)
   * so `buildClubEducationProgress` and its projection remain in one place
   * — the API's list endpoint returns the full `SpeechApproval` shape.
   */
  async findApprovalsForClub(clubUnitId: string): Promise<ProgressApproval[]> {
    const rows = await this.db.speechApproval.findMany({
      where: { clubUnitId },
      select: { id: true, speechSlotId: true, status: true, approvedAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      speechSlotId: row.speechSlotId,
      status: row.status,
      approvedAt: row.approvedAt,
    }));
  }
}
