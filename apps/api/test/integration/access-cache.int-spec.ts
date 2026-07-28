import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { startTestRedis } from '../support/test-redis';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { GrantCacheService } from '../../src/modules/access/grant-cache.service';
import { AuthzService } from '../../src/common/authz/authz.service';

describe('Access resolution cache (integration)', () => {
  let db: PrismaClient;
  let stopDb: () => Promise<void>;
  let stopRedis: () => Promise<void>;
  let authz: AuthzService;
  let people: PersonRepository;
  let roleAssignments: RoleAssignmentRepository;

  let clubId: string;
  let clubPath: string;
  let club2Id: string;
  let club2Path: string;
  let programYearId: string;

  beforeAll(async () => {
    ({ db, stop: stopDb } = await startTestDb());
    const redis = await startTestRedis();
    stopRedis = redis.stop;
    await seedAccessVocabulary(db);

    const orgUnits = new OrgUnitRepository(db);
    const programYears = new ProgramYearRepository(db);
    people = new PersonRepository(db);
    roleAssignments = new RoleAssignmentRepository(db);
    const cache = new GrantCacheService(redis.client);
    authz = new AuthzService(new AccessRepository(db, cache));

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
    const club2 = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c2',
      name: 'Club 2',
      timezone: 'Asia/Dhaka',
    });
    clubId = club.id;
    clubPath = club.path;
    club2Id = club2.id;
    club2Path = club2.path;

    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });
    programYearId = year.id;
  });
  afterAll(async () => {
    await stopDb();
    await stopRedis();
  });

  it('a role assignment mid-session takes effect on the next check (permission_version bump)', async () => {
    const member = await people.create({ email: 'member@example.com', fullName: 'New Treasurer' });
    const request = {
      principal: { userId: member.id, roles: [], scopes: [] },
      resource: 'finance.ledger',
      action: 'read' as const,
      scope: clubPath,
    };

    const before = await authz.authorize(request);
    expect(before.allowed).toBe(false);

    await roleAssignments.assign({
      personId: member.id,
      orgUnitId: clubId,
      role: 'club_treasurer',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: member.id,
    });

    const after = await authz.authorize(request);
    expect(after.allowed).toBe(true);
  });

  it('serves a stale cached grant set until permission_version actually changes', async () => {
    // A distinct club (club2), not clubId — reusing clubId collides with the
    // first test's still-active club_treasurer@clubId assignment against
    // Slice 2's role_assignment_singleton index.
    const treasurer = await people.create({
      email: 'stale@example.com',
      fullName: 'Stale Treasurer',
    });
    const assignment = await roleAssignments.assign({
      personId: treasurer.id,
      orgUnitId: club2Id,
      role: 'club_treasurer',
      programYearId,
      termStart: new Date('2026-07-01'),
      termEnd: new Date('2027-06-30'),
      appointedBy: treasurer.id,
    });
    const request = {
      principal: { userId: treasurer.id, roles: [], scopes: [] },
      resource: 'finance.ledger',
      action: 'read' as const,
      scope: club2Path,
    };

    const first = await authz.authorize(request);
    expect(first.allowed).toBe(true);

    // Mutate the assignment directly, bypassing the repository's version
    // bump — a real revocation goes through RoleAssignmentRepository.end(),
    // which does bump the version (proved by the next assertion).
    await db.roleAssignment.update({ where: { id: assignment.id }, data: { status: 'ended' } });

    const stillCached = await authz.authorize(request);
    expect(stillCached.allowed).toBe(true); // same permissionVersion key -> stale cache hit

    await roleAssignments.end(assignment.id, 'resigned', treasurer.id);

    const afterRealEnd = await authz.authorize(request);
    expect(afterRealEnd.allowed).toBe(false); // new version -> fresh resolution
  });
});
