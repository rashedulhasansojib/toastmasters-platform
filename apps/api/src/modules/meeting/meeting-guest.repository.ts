import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
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

  async create(input: {
    meetingId: string;
    fullName: string;
    email?: string;
    phone?: string;
    notes?: string;
    guestId?: string;
    addedBy: string;
  }): Promise<MeetingGuest> {
    const row = await this.db.meetingGuest.create({
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
    return toMeetingGuest(row);
  }

  async update(input: {
    id: string;
    fullName?: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    present?: boolean;
  }): Promise<MeetingGuest> {
    const row = await this.db.meetingGuest.update({
      where: { id: input.id },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.present !== undefined ? { present: input.present } : {}),
      },
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
