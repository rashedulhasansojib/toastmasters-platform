import { Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Person } from '@toastmasters/contracts';

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
  constructor(private readonly db: PrismaClient = getPrisma()) {}

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
}
