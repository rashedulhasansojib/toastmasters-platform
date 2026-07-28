import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type CapabilityTokenRow = Awaited<ReturnType<PrismaClient['capabilityToken']['create']>>;

@Injectable()
export class CapabilityTokenRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  create(input: {
    meetingId: string;
    purpose: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<CapabilityTokenRow> {
    return this.db.capabilityToken.create({ data: input });
  }

  findByHash(tokenHash: string): Promise<CapabilityTokenRow | null> {
    return this.db.capabilityToken.findUnique({ where: { tokenHash } });
  }

  findById(id: string): Promise<CapabilityTokenRow | null> {
    return this.db.capabilityToken.findUnique({ where: { id } });
  }

  async revoke(id: string): Promise<CapabilityTokenRow> {
    return this.db.capabilityToken.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  /** Called on guarded close-out (Slice 8) — "revoked at meeting close" (roadmap.md's guest-token invariant). */
  async revokeAllForMeeting(meetingId: string): Promise<void> {
    await this.db.capabilityToken.updateMany({
      where: { meetingId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
