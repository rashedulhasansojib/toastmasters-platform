import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { SupportRequest, SupportRequestStatus, SupportInvitee } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type SupportRequestRow = Awaited<ReturnType<PrismaClient['supportRequest']['create']>>;

function toSupportRequest(row: SupportRequestRow): SupportRequest {
  return {
    id: row.id,
    requestingUnitId: row.requestingUnitId,
    meetingId: row.meetingId,
    roleKey: row.roleKey,
    neededBy: row.neededBy.toISOString(),
    invitees: row.invitees as unknown as SupportInvitee[],
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class SupportRequestRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    requestingUnitId: string;
    meetingId: string;
    roleKey: string;
    neededBy: Date;
    invitees: SupportInvitee[];
  }): Promise<SupportRequest> {
    const row = await this.db.supportRequest.create({ data: input as never });
    return toSupportRequest(row);
  }

  async findById(id: string): Promise<SupportRequest | null> {
    const row = await this.db.supportRequest.findUnique({ where: { id } });
    return row ? toSupportRequest(row) : null;
  }

  async findByClub(requestingUnitId: string): Promise<SupportRequest[]> {
    const rows = await this.db.supportRequest.findMany({
      where: { requestingUnitId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toSupportRequest);
  }

  async updateInvitees(id: string, invitees: SupportInvitee[]): Promise<SupportRequest> {
    const row = await this.db.supportRequest.update({
      where: { id },
      data: { invitees: invitees as never },
    });
    return toSupportRequest(row);
  }

  async setStatus(id: string, status: SupportRequestStatus): Promise<SupportRequest> {
    const row = await this.db.supportRequest.update({ where: { id }, data: { status } });
    return toSupportRequest(row);
  }
}
