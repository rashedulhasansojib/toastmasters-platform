import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { ProspectCommunication } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type ProspectCommunicationRow = Awaited<
  ReturnType<PrismaClient['prospectCommunication']['create']>
>;

function toProspectCommunication(row: ProspectCommunicationRow): ProspectCommunication {
  return {
    id: row.id,
    prospectId: row.prospectId,
    channel: row.channel,
    note: row.note,
    loggedBy: row.loggedBy,
    loggedAt: row.loggedAt.toISOString(),
  };
}

@Injectable()
export class ProspectCommunicationRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    prospectId: string;
    channel: 'call' | 'message' | 'email' | 'in_person' | 'other';
    note: string;
    loggedBy: string;
  }): Promise<ProspectCommunication> {
    const row = await this.db.prospectCommunication.create({ data: input });
    return toProspectCommunication(row);
  }

  async findByProspect(prospectId: string): Promise<ProspectCommunication[]> {
    const rows = await this.db.prospectCommunication.findMany({
      where: { prospectId },
      orderBy: { loggedAt: 'desc' },
    });
    return rows.map(toProspectCommunication);
  }
}
