import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Guest } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type GuestRow = Awaited<ReturnType<PrismaClient['guest']['create']>>;

function toGuest(row: GuestRow): Guest {
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
export class GuestRepository {
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
  }): Promise<Guest> {
    const row = await this.db.guest.create({
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
    return toGuest(row);
  }

  async findByClub(orgUnitId: string): Promise<Guest[]> {
    const rows = await this.db.guest.findMany({
      where: { orgUnitId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toGuest);
  }

  async findById(id: string): Promise<Guest | null> {
    const row = await this.db.guest.findUnique({ where: { id } });
    return row ? toGuest(row) : null;
  }

  async update(
    id: string,
    patch: {
      pipelineStatus?: 'contacted' | 'interested' | 'joined_meeting' | 'not_interested';
      email?: string;
      phone?: string;
      whatsapp?: string;
      photoUrl?: string;
      bio?: string;
      leadSource?: string;
      preferredRole?: string;
    },
  ): Promise<Guest> {
    const row = await this.db.guest.update({ where: { id }, data: patch });
    return toGuest(row);
  }

  /** M4 Slice 4: sets `pipelineStatus: 'joined'` — never client-reachable via `update()`, only via GuestConversionService. */
  async markConverted(id: string, convertedToPersonId: string): Promise<Guest> {
    const row = await this.db.guest.update({
      where: { id },
      data: { pipelineStatus: 'joined', convertedToPersonId, convertedAt: new Date() },
    });
    return toGuest(row);
  }

  /**
   * Hard delete for a not-yet-converted guest, plus the guest-owned child
   * rows (visits, communications). Rows on tables that outlive the guest
   * conceptually — meeting sign-in sheets and speech evaluations — have
   * their guest FK nulled instead, since both tables already carry a
   * snapshot of the guest's identity at record time (meeting_guest keeps
   * fullName/email/phone; speech_evaluation stays anchored to its meeting).
   * The guest.service caller is responsible for refusing the delete when
   * the guest has already converted.
   */
  async remove(id: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.speechEvaluation.updateMany({
        where: { speakerGuestId: id },
        data: { speakerGuestId: null },
      });
      await tx.meetingGuest.updateMany({
        where: { guestId: id },
        data: { guestId: null },
      });
      await tx.guestVisit.deleteMany({ where: { guestId: id } });
      await tx.guestCommunication.deleteMany({ where: { guestId: id } });
      await tx.guest.delete({ where: { id } });
    });
  }
}
