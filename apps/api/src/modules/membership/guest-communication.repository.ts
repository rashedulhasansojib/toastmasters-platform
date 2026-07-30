import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { GuestCommunication, GuestCommunicationChannel } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type GuestCommunicationRow = Awaited<ReturnType<PrismaClient['guestCommunication']['create']>>;

function toGuestCommunication(row: GuestCommunicationRow): GuestCommunication {
  return {
    id: row.id,
    guestId: row.guestId,
    channel: row.channel,
    note: row.note,
    loggedBy: row.loggedBy,
    loggedAt: row.loggedAt.toISOString(),
  };
}

@Injectable()
export class GuestCommunicationRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    guestId: string;
    channel: GuestCommunicationChannel;
    note: string;
    loggedBy: string;
  }): Promise<GuestCommunication> {
    const row = await this.db.guestCommunication.create({ data: input });
    return toGuestCommunication(row);
  }

  async findByGuest(guestId: string): Promise<GuestCommunication[]> {
    const rows = await this.db.guestCommunication.findMany({
      where: { guestId },
      orderBy: { loggedAt: 'desc' },
    });
    return rows.map(toGuestCommunication);
  }

  async findById(id: string): Promise<GuestCommunication | null> {
    const row = await this.db.guestCommunication.findUnique({ where: { id } });
    return row ? toGuestCommunication(row) : null;
  }

  async update(
    id: string,
    patch: { channel?: GuestCommunicationChannel; note?: string },
  ): Promise<GuestCommunication> {
    const row = await this.db.guestCommunication.update({ where: { id }, data: patch });
    return toGuestCommunication(row);
  }

  async remove(id: string): Promise<void> {
    await this.db.guestCommunication.delete({ where: { id } });
  }
}
