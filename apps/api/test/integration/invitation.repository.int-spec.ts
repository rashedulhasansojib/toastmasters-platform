import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { PrismaClient } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { InvitationRepository } from '../../src/modules/identity/invitation.repository';

describe('InvitationRepository (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let invitations: InvitationRepository;
  let people: PersonRepository;
  let clubId: string;
  let programYearId: string;
  let inviterId: string;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    invitations = new InvitationRepository(db);
    people = new PersonRepository(db);

    const orgUnits = new OrgUnitRepository(db);
    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const club = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c1',
      name: 'Club 1',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;

    const programYears = new ProgramYearRepository(db);
    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;

    const inviter = await people.create({ email: 'inviter@example.com', fullName: 'Inviter' });
    inviterId = inviter.id;
  });
  afterAll(async () => {
    await stop();
  });

  it('creates an invitation and finds it by token hash, with no tokenHash on the returned shape', async () => {
    const created = await invitations.create({
      email: 'newcomer@example.com',
      tokenHash: 'hash-1',
      orgUnitId: clubId,
      role: 'club_president',
      programYearId,
      invitedBy: inviterId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(created.email).toBe('newcomer@example.com');
    expect(created.status).toBe('pending');
    expect((created as unknown as { tokenHash?: string }).tokenHash).toBeUndefined();

    const found = await invitations.findByTokenHash('hash-1');
    expect(found?.id).toBe(created.id);

    expect(await invitations.findByTokenHash('unknown-hash')).toBeNull();
  });

  it('accept() creates a new Person, sets credentials, activates the RoleAssignment, and marks the invitation accepted', async () => {
    await invitations.create({
      email: 'fresh@example.com',
      tokenHash: 'hash-fresh',
      orgUnitId: clubId,
      role: 'club_treasurer',
      programYearId,
      invitedBy: inviterId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await invitations.accept({
      tokenHash: 'hash-fresh',
      fullName: 'Fresh Person',
      passwordHash: 'argon2-hash-fresh',
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
    });

    const person = await db.person.findUnique({ where: { id: result.personId } });
    expect(person?.email).toBe('fresh@example.com');
    expect(person?.passwordHash).toBe('argon2-hash-fresh');
    expect(person?.status).toBe('active');
    expect(person?.permissionVersion).toBe(2); // bumped once on role-assignment creation

    const roleAssignment = await db.roleAssignment.findFirst({
      where: { personId: result.personId, role: 'club_treasurer' },
    });
    expect(roleAssignment?.status).toBe('active');
    expect(roleAssignment?.appointedBy).toBe(inviterId);

    const invitation = await db.invitation.findUnique({ where: { tokenHash: 'hash-fresh' } });
    expect(invitation?.status).toBe('accepted');
    expect(invitation?.acceptedPersonId).toBe(result.personId);
    expect(invitation?.acceptedAt).not.toBeNull();
  });

  it('accept() attaches to an existing Person and never overwrites an existing password hash', async () => {
    const existing = await people.create({
      email: 'existing@example.com',
      fullName: 'Existing Person',
    });
    await people.setCredentials(existing.id, 'original-hash');

    await invitations.create({
      email: 'existing@example.com',
      tokenHash: 'hash-existing',
      orgUnitId: clubId,
      role: 'club_vpe',
      programYearId,
      invitedBy: inviterId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await invitations.accept({
      tokenHash: 'hash-existing',
      fullName: 'Ignored Name',
      passwordHash: 'attempted-overwrite-hash',
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
    });

    expect(result.personId).toBe(existing.id);
    const person = await db.person.findUnique({ where: { id: existing.id } });
    expect(person?.passwordHash).toBe('original-hash');
    expect(person?.fullName).toBe('Existing Person');

    const roleAssignment = await db.roleAssignment.findFirst({
      where: { personId: existing.id, role: 'club_vpe' },
    });
    expect(roleAssignment?.status).toBe('active');
  });

  it('accept() throws and writes nothing for an expired or non-pending invitation', async () => {
    await invitations.create({
      email: 'expired@example.com',
      tokenHash: 'hash-expired',
      orgUnitId: clubId,
      role: 'club_member',
      programYearId,
      invitedBy: inviterId,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    await expect(
      invitations.accept({
        tokenHash: 'hash-expired',
        fullName: 'Too Late',
        passwordHash: 'irrelevant-hash',
        termStart: new Date('2026-07-01'),
        termEnd: new Date('2027-06-30'),
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(await db.person.findUnique({ where: { email: 'expired@example.com' } })).toBeNull();

    await expect(
      invitations.accept({
        tokenHash: 'unknown-hash-entirely',
        fullName: 'Nobody',
        passwordHash: 'irrelevant-hash',
        termStart: new Date('2026-07-01'),
        termEnd: new Date('2027-06-30'),
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
