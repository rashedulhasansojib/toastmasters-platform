import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, Prisma, type PrismaClient } from '@toastmasters/db';
import type { MeetingGuest } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type MeetingGuestRow = Awaited<ReturnType<PrismaClient['meetingGuest']['create']>>;

function toMeetingGuest(row: MeetingGuestRow): MeetingGuest {
  return {
    id: row.id,
    meetingId: row.meetingId,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    guestId: row.guestId,
    present: row.present,
    addedBy: row.addedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class MeetingGuestRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  /**
   * A club Guest's visit history is derived from the meeting Guest List, not
   * hand-entered: marking a linked guest present on a meeting *is* the visit.
   *
   * The write happens here, in the same transaction as the `present` flip,
   * rather than by calling membership's `GuestVisitRepository` — MembershipModule
   * already imports MeetingModule, so reaching back the other way would be a
   * circular module dependency. Doing it in one transaction is also the
   * stronger guarantee: the roster and the visit history cannot disagree.
   *
   * `attendedAt` comes from the meeting's own `scheduledAt`, so there is no
   * second date to key wrong, and the (guestId, meetingId) unique index makes
   * a repeated present-flip idempotent.
   */
  private async syncGuestVisit(
    tx: Prisma.TransactionClient,
    input: { guestId: string | null; meetingId: string; present: boolean; loggedBy: string },
  ): Promise<void> {
    if (!input.guestId) return;

    if (!input.present) {
      // Un-marking attendance is a correction of a roster mistake, not the
      // overwriting of an append-only fact — the visit simply never happened.
      await tx.guestVisit.deleteMany({
        where: { guestId: input.guestId, meetingId: input.meetingId },
      });
      return;
    }

    const meeting = await tx.meeting.findUnique({
      where: { id: input.meetingId },
      select: { scheduledAt: true },
    });
    if (!meeting) return;

    await tx.guestVisit.upsert({
      where: { guestId_meetingId: { guestId: input.guestId, meetingId: input.meetingId } },
      create: {
        guestId: input.guestId,
        meetingId: input.meetingId,
        attendedAt: meeting.scheduledAt,
        loggedBy: input.loggedBy,
      },
      update: {},
    });
  }

  async create(input: {
    meetingId: string;
    fullName: string;
    email?: string;
    phone?: string;
    notes?: string;
    guestId?: string;
    addedBy: string;
  }): Promise<MeetingGuest> {
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.meetingGuest.create({
        data: {
          meetingId: input.meetingId,
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          notes: input.notes ?? null,
          guestId: input.guestId ?? null,
          addedBy: input.addedBy,
        },
      });
      await this.syncGuestVisit(tx, {
        guestId: created.guestId,
        meetingId: created.meetingId,
        present: created.present,
        loggedBy: input.addedBy,
      });
      return created;
    });
    return toMeetingGuest(row);
  }

  async update(input: {
    id: string;
    fullName?: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    present?: boolean;
    loggedBy: string;
  }): Promise<MeetingGuest> {
    const row = await this.db.$transaction(async (tx) => {
      const updated = await tx.meetingGuest.update({
        where: { id: input.id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.present !== undefined ? { present: input.present } : {}),
        },
      });
      if (input.present !== undefined) {
        await this.syncGuestVisit(tx, {
          guestId: updated.guestId,
          meetingId: updated.meetingId,
          present: updated.present,
          loggedBy: input.loggedBy,
        });
      }
      return updated;
    });
    return toMeetingGuest(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.meetingGuest.delete({ where: { id } });
  }

  async findById(id: string): Promise<MeetingGuest | null> {
    const row = await this.db.meetingGuest.findUnique({ where: { id } });
    return row ? toMeetingGuest(row) : null;
  }

  async findByMeeting(meetingId: string): Promise<MeetingGuest[]> {
    const rows = await this.db.meetingGuest.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toMeetingGuest);
  }
}
