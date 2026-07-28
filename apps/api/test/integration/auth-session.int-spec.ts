import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';

describe('Login/session repository seams (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let people: PersonRepository;
  let programYears: ProgramYearRepository;
  let orgUnits: OrgUnitRepository;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    people = new PersonRepository(db);
    programYears = new ProgramYearRepository(db);
    orgUnits = new OrgUnitRepository(db);
  });
  afterAll(async () => {
    await stop();
  });

  it('setCredentials + findCredentialsByEmail round-trips a hash and activates the person', async () => {
    const person = await people.create({ email: 'creds@example.com', fullName: 'Creds Person' });
    const before = await people.findCredentialsByEmail('creds@example.com');
    expect(before).toEqual({ id: person.id, passwordHash: null, status: 'invited' });

    await people.setCredentials(person.id, '$argon2id$fake-hash');
    const after = await people.findCredentialsByEmail('creds@example.com');
    expect(after).toEqual({ id: person.id, passwordHash: '$argon2id$fake-hash', status: 'active' });
  });

  it('findCredentialsByEmail returns null for an unknown email', async () => {
    expect(await people.findCredentialsByEmail('nobody-at-all@example.com')).toBeNull();
  });

  it('findCurrent returns the one program year marked current', async () => {
    expect(await programYears.findCurrent()).toBeNull();

    await programYears.create({
      id: '2025-2026',
      startsOn: new Date('2025-07-01'),
      endsOn: new Date('2026-06-30'),
    });
    await db.programYear.update({ where: { id: '2025-2026' }, data: { status: 'closed' } });
    await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    await db.programYear.update({ where: { id: '2026-2027' }, data: { status: 'current' } });

    const current = await programYears.findCurrent();
    expect(current?.id).toBe('2026-2027');
  });

  it('OrgUnitRepository.findById returns null for an unknown id, the unit for a known one', async () => {
    expect(await orgUnits.findById('00000000-0000-0000-0000-000000000000')).toBeNull();

    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r-session',
      name: 'Session Region',
      timezone: 'Asia/Dhaka',
    });
    const found = await orgUnits.findById(region.id);
    expect(found?.id).toBe(region.id);
  });
});
