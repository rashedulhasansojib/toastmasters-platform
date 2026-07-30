import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { Person, ClubMembership, ProgramYear, OrgUnit } from '@toastmasters/contracts';
import { AuthService } from './auth.service';

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    email: 'karim@example.com',
    fullName: 'Karim Hossain',
    phone: null,
    photoUrl: null,
    bio: null,
    tiMemberNumber: null,
    status: 'active',
    mfaEnabled: false,
    permissionVersion: 4,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    ...overrides,
  };
}

function membership(overrides: Partial<ClubMembership> = {}): ClubMembership {
  return {
    id: 'membership-1',
    personId: 'person-1',
    clubUnitId: 'club-1',
    memberType: 'renewing',
    joinedAt: new Date().toISOString(),
    leftAt: null,
    isPrimary: true,
    tiStanding: 'good',
    localStatus: 'active',
    provenance: 'portal',
    lastReconciledAt: null,
    ...overrides,
  };
}

function orgUnit(overrides: Partial<OrgUnit> = {}): OrgUnit {
  return {
    id: 'club-B',
    type: 'club',
    parentId: 'd1',
    path: 'r1.d1.cB',
    depth: 2,
    name: 'Club B',
    code: 'cB',
    status: 'active',
    timezone: 'Asia/Dhaka',
    ...overrides,
  } as OrgUnit;
}

function makeService(overrides: {
  credentials?: {
    id: string;
    passwordHash: string | null;
    status: 'invited' | 'active' | 'disabled';
  } | null;
  person?: Person | null;
  memberships?: ClubMembership[];
  currentYear?: ProgramYear | null;
  orgUnit?: OrgUnit | null;
  orgUnits?: OrgUnit[];
  verifies?: boolean;
  roleUnitIds?: string[];
  platformUnitIds?: string[];
}) {
  const people = {
    findCredentialsByEmail: vi.fn().mockResolvedValue(overrides.credentials ?? null),
    findById: vi.fn().mockResolvedValue('person' in overrides ? overrides.person : person()),
  };
  const clubMemberships = {
    findByPerson: vi.fn().mockResolvedValue(overrides.memberships ?? []),
  };
  const programYears = {
    findCurrent: vi.fn().mockResolvedValue(overrides.currentYear ?? null),
  };
  const orgUnits = {
    findById: vi.fn().mockResolvedValue(overrides.orgUnit ?? null),
    findByIds: vi.fn().mockResolvedValue(overrides.orgUnits ?? []),
  };
  const passwords = {
    verify: vi.fn().mockResolvedValue(overrides.verifies ?? true),
  };
  const session = {
    issue: vi.fn().mockImplementation(async (claims) => `token-for-${JSON.stringify(claims)}`),
  };
  const roleAssignments = {
    findActiveOrgUnitIdsForPerson: vi.fn().mockResolvedValue(overrides.roleUnitIds ?? []),
  };
  const grantAdmin = {
    findPlatformRoleOrgUnitIdsForPerson: vi.fn().mockResolvedValue(overrides.platformUnitIds ?? []),
  };

  const service = new AuthService(
    people as never,
    clubMemberships as never,
    programYears as never,
    orgUnits as never,
    passwords as never,
    session as never,
    roleAssignments as never,
    grantAdmin as never,
  );
  return {
    service,
    people,
    clubMemberships,
    programYears,
    orgUnits,
    passwords,
    session,
    roleAssignments,
    grantAdmin,
  };
}

describe('AuthService.login', () => {
  it('rejects an unknown email with a generic message', async () => {
    const { service } = makeService({ credentials: null });
    await expect(service.login('nobody@example.com', 'whatever')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a person who has never set a password, with the same generic message', async () => {
    const { service } = makeService({
      credentials: { id: 'person-1', passwordHash: null, status: 'invited' },
    });
    await expect(service.login('karim@example.com', 'whatever')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a wrong password with the same generic message', async () => {
    const { service } = makeService({
      credentials: { id: 'person-1', passwordHash: '$argon2id$hash', status: 'active' },
      verifies: false,
    });
    await expect(service.login('karim@example.com', 'wrong')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('issues a session for correct credentials, resolving activeUnitId from the primary open membership', async () => {
    const { service, session } = makeService({
      credentials: { id: 'person-1', passwordHash: '$argon2id$hash', status: 'active' },
      orgUnit: orgUnit(),
      memberships: [
        membership({ id: 'm1', clubUnitId: 'club-A', isPrimary: false }),
        membership({ id: 'm2', clubUnitId: 'club-B', isPrimary: true, leftAt: null }),
        membership({
          id: 'm3',
          clubUnitId: 'club-C',
          isPrimary: true,
          leftAt: new Date().toISOString(),
        }),
      ],
      currentYear: {
        id: '2026-2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        status: 'current',
      },
    });

    const { session: response } = await service.login('karim@example.com', 'correct');
    expect(response).toEqual({
      personId: 'person-1',
      fullName: 'Karim Hossain',
      activeUnitId: 'club-B',
      activeUnit: { id: 'club-B', name: 'Club B', type: 'club' },
      programYearId: '2026-2027',
    });
    expect(session.issue).toHaveBeenCalledWith({
      sub: 'person-1',
      activeUnitId: 'club-B',
      programYearId: '2026-2027',
      v: 4,
    });
  });

  it('falls back to the first club the person holds a role at when they have no membership', async () => {
    const { service } = makeService({
      credentials: { id: 'person-1', passwordHash: '$argon2id$hash', status: 'active' },
      memberships: [],
      roleUnitIds: ['area-1', 'club-Z'],
      // Area first, so picking the club proves a tier filter, not just "the first unit".
      orgUnits: [
        orgUnit({ id: 'area-1', type: 'area', name: 'Area 5', code: 'a5', path: 'r1.d1.a5' }),
        orgUnit({ id: 'club-Z', name: 'Club Z', code: 'cZ', path: 'r1.d1.cZ' }),
      ],
    });

    const { session: response } = await service.login('karim@example.com', 'correct');
    expect(response.activeUnitId).toBe('club-Z');
    expect(response.activeUnit).toEqual({ id: 'club-Z', name: 'Club Z', type: 'club' });
  });

  it('logs in fine with no membership, no club role, and no current program year — all nullable', async () => {
    const { service } = makeService({
      credentials: { id: 'person-1', passwordHash: '$argon2id$hash', status: 'active' },
      memberships: [],
      currentYear: null,
    });
    const { session: response } = await service.login('karim@example.com', 'correct');
    expect(response.activeUnitId).toBeNull();
    expect(response.activeUnit).toBeNull();
    expect(response.programYearId).toBeNull();
  });
});

describe('AuthService.switchUnit', () => {
  it('reissues a session with only activeUnitId changed', async () => {
    const targetUnit = {
      id: 'club-Z',
      type: 'club',
      parentId: 'district-1',
      path: 'r1.d41.cZ',
      depth: 2,
      name: 'Club Z',
      code: 'cZ',
      status: 'active',
      timezone: 'Asia/Dhaka',
    } as OrgUnit;
    const { service, session } = makeService({
      orgUnit: targetUnit,
      person: person({ permissionVersion: 9 }),
    });

    const principal = {
      userId: 'person-1',
      roles: [],
      scopes: [],
      activeUnitId: 'club-A',
      programYearId: '2026-2027',
      v: 4,
    };
    const { session: response } = await service.switchUnit(principal, 'club-Z');

    expect(response.activeUnitId).toBe('club-Z');
    expect(response.activeUnit).toEqual({ id: 'club-Z', name: 'Club Z', type: 'club' });
    expect(response.programYearId).toBe('2026-2027'); // unchanged
    expect(session.issue).toHaveBeenCalledWith({
      sub: 'person-1',
      activeUnitId: 'club-Z',
      programYearId: '2026-2027',
      v: 4, // carried forward from the session, not re-fetched from the person's current value (9)
    });
  });

  it('rejects switching to an org unit that does not exist', async () => {
    const { service } = makeService({ orgUnit: null });
    const principal = { userId: 'person-1', roles: [], scopes: [] };
    await expect(service.switchUnit(principal, 'nonexistent')).rejects.toThrow(NotFoundException);
  });
});

describe('AuthService.me', () => {
  it('returns the current session without issuing a new token', async () => {
    const { service, session } = makeService({
      orgUnit: orgUnit({ id: 'club-A', name: 'Club A', code: 'cA', path: 'r1.d1.cA' }),
    });
    const principal = {
      userId: 'person-1',
      roles: [],
      scopes: [],
      activeUnitId: 'club-A',
      programYearId: '2026-2027',
      v: 4,
    };

    const result = await service.me(principal);
    expect(result).toEqual({
      personId: 'person-1',
      fullName: 'Karim Hossain',
      activeUnitId: 'club-A',
      activeUnit: { id: 'club-A', name: 'Club A', type: 'club' },
      programYearId: '2026-2027',
    });
    expect(session.issue).not.toHaveBeenCalled();
  });

  it('rejects a principal whose person no longer exists', async () => {
    const { service } = makeService({ person: null });
    const principal = { userId: 'ghost', roles: [], scopes: [] };
    await expect(service.me(principal)).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService.switchableUnits', () => {
  it('combines role-assignment and platform-role units, deduplicated, in one findByIds call', async () => {
    const unitA = {
      id: 'club-A',
      type: 'club',
      parentId: 'd1',
      path: 'r1.d1.cA',
      depth: 2,
      name: 'Club A',
      code: 'cA',
      status: 'active',
      timezone: 'UTC',
    } as OrgUnit;
    const unitB = { ...unitA, id: 'club-B', code: 'cB', name: 'Club B', path: 'r1.d1.cB' };
    const { service, orgUnits } = makeService({
      roleUnitIds: ['club-A', 'club-B'],
      platformUnitIds: ['club-B'], // overlaps with a role-assignment unit — must not duplicate
      orgUnits: [unitA, unitB],
    });
    const principal = { userId: 'person-1', roles: [], scopes: [] };

    const result = await service.switchableUnits(principal);
    expect(orgUnits.findByIds).toHaveBeenCalledTimes(1);
    const calledWith = orgUnits.findByIds.mock.calls[0]?.[0] as string[];
    expect(calledWith.sort()).toEqual(['club-A', 'club-B']);
    expect(result).toEqual([
      { id: 'club-A', name: 'Club A', type: 'club', path: 'r1.d1.cA' },
      { id: 'club-B', name: 'Club B', type: 'club', path: 'r1.d1.cB' },
    ]);
  });

  it('returns [] for a person who holds no role anywhere', async () => {
    const { service } = makeService({ roleUnitIds: [], platformUnitIds: [] });
    const principal = { userId: 'person-1', roles: [], scopes: [] };
    expect(await service.switchableUnits(principal)).toEqual([]);
  });
});
