import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Person, PersonStatus } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type PersonRow = Awaited<ReturnType<PrismaClient['person']['create']>>;

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    photoUrl: row.photoUrl,
    bio: row.bio,
    tiMemberNumber: row.tiMemberNumber,
    status: row.status,
    mfaEnabled: row.mfaEnabled,
    permissionVersion: row.permissionVersion,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

@Injectable()
export class PersonRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    email: string;
    fullName: string;
    phone?: string | null;
    tiMemberNumber?: string | null;
  }): Promise<Person> {
    const row = await this.db.person.create({
      data: {
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        phone: input.phone ?? null,
        tiMemberNumber: input.tiMemberNumber ?? null,
      },
    });
    return toPerson(row);
  }

  async findById(id: string): Promise<Person | null> {
    const row = await this.db.person.findUnique({ where: { id } });
    return row ? toPerson(row) : null;
  }

  async findByEmail(email: string): Promise<Person | null> {
    const row = await this.db.person.findUnique({ where: { email: email.toLowerCase() } });
    return row ? toPerson(row) : null;
  }

  /**
   * The minimal seam a fixture (or, later, a self-service invite-acceptance
   * flow — not built in M1) uses to give a person a password. Flips status to
   * 'active': there is no separate activation step yet.
   */
  async setCredentials(personId: string, passwordHash: string): Promise<void> {
    await this.db.person.update({
      where: { id: personId },
      data: { passwordHash, status: 'active' },
    });
  }

  /** Narrow, login-only read — never exposes the hash outside this repository. */
  async findCredentialsByEmail(
    email: string,
  ): Promise<{ id: string; passwordHash: string | null; status: PersonStatus } | null> {
    return this.db.person.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, passwordHash: true, status: true },
    });
  }
}
