import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { SpeechApproval } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import type { AutoRequest, AutoRequestMeeting, AutoRequestSlot } from './speech-approval-requests';
import { buildAutoRequests } from './speech-approval-requests';

/** Prisma's `TransactionClient` type — a callback tx or the top-level client both satisfy this. */
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0] | PrismaClient;

type SpeechApprovalRow = Awaited<ReturnType<PrismaClient['speechApproval']['create']>>;

function toSpeechApproval(row: SpeechApprovalRow): SpeechApproval {
  return {
    id: row.id,
    speechSlotId: row.speechSlotId,
    personId: row.personId,
    clubUnitId: row.clubUnitId,
    pathCode: row.pathCode,
    projectCode: row.projectCode,
    level: row.level,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
    deniedAt: row.deniedAt?.toISOString() ?? null,
    deniedBy: row.deniedBy,
    denialReason: row.denialReason,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * M11 Slice 1: writes SpeechApproval rows the meeting-close hook enqueues.
 *
 * `createManyForMeeting` runs inside the caller's transaction (so
 * meeting-close either persists its state change *and* the requests, or
 * neither) and relies on the unique on `speech_slot_id` for idempotence —
 * re-closing a meeting with `skipDuplicates` yields no dupe rows and no
 * error.
 */
@Injectable()
export class SpeechApprovalRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /**
   * Fetch approved slots on the meeting, build the auto-requests, insert
   * with `skipDuplicates`. Idempotent — a re-close inserts zero rows.
   * Returns the number of rows the insert reported new.
   */
  async createManyForMeeting(
    tx: Tx,
    meeting: AutoRequestMeeting,
    meetingId: string,
  ): Promise<{ createdCount: number; requests: AutoRequest[] }> {
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
    const requests = buildAutoRequests(meeting, slots);
    if (requests.length === 0) return { createdCount: 0, requests };

    const result = await tx.speechApproval.createMany({
      data: requests.map((r) => ({
        speechSlotId: r.speechSlotId,
        personId: r.personId,
        clubUnitId: r.clubUnitId,
        pathCode: r.pathCode,
        projectCode: r.projectCode,
        level: r.level,
        requestedAt: r.requestedAt,
      })),
      skipDuplicates: true,
    });
    return { createdCount: result.count, requests };
  }

  async findBySpeechSlotId(speechSlotId: string): Promise<SpeechApproval | null> {
    const row = await this.db.speechApproval.findUnique({ where: { speechSlotId } });
    return row ? toSpeechApproval(row) : null;
  }

  async findByPersonAndClub(personId: string, clubUnitId: string): Promise<SpeechApproval[]> {
    const rows = await this.db.speechApproval.findMany({
      where: { personId, clubUnitId },
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map(toSpeechApproval);
  }
}
