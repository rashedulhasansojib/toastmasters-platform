import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Prospect } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type ProspectRow = Awaited<ReturnType<PrismaClient['prospect']['create']>>;

function toProspect(row: ProspectRow): Prospect {
  return {
    id: row.id,
    orgUnitId: row.orgUnitId,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    photoUrl: row.photoUrl,
    bio: row.bio,
    leadSource: row.leadSource,
    preferredRole: row.preferredRole,
    pipelineStatus: row.pipelineStatus,
    convertedToPersonId: row.convertedToPersonId,
    convertedAt: row.convertedAt?.toISOString() ?? null,
    deleteAfter: row.deleteAfter.toISOString(),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    piiRedactedAt: row.piiRedactedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ProspectRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    orgUnitId: string;
    fullName: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    photoUrl?: string;
    bio?: string;
    leadSource?: string;
    preferredRole?: string;
    deleteAfter: Date;
    createdBy: string;
  }): Promise<Prospect> {
    const row = await this.db.prospect.create({
      data: {
        orgUnitId: input.orgUnitId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        whatsapp: input.whatsapp,
        photoUrl: input.photoUrl,
        bio: input.bio,
        leadSource: input.leadSource,
        preferredRole: input.preferredRole,
        deleteAfter: input.deleteAfter,
        createdBy: input.createdBy,
      },
    });
    return toProspect(row);
  }

  async findByClub(orgUnitId: string): Promise<Prospect[]> {
    const rows = await this.db.prospect.findMany({
      where: { orgUnitId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toProspect);
  }

  async findById(id: string): Promise<Prospect | null> {
    const row = await this.db.prospect.findUnique({ where: { id } });
    return row ? toProspect(row) : null;
  }

  async update(
    id: string,
    patch: {
      pipelineStatus?: 'contacted' | 'interested' | 'not_interested';
      email?: string;
      phone?: string;
      whatsapp?: string;
      photoUrl?: string;
      bio?: string;
      leadSource?: string;
      preferredRole?: string;
    },
  ): Promise<Prospect> {
    const row = await this.db.prospect.update({ where: { id }, data: patch });
    return toProspect(row);
  }
}
