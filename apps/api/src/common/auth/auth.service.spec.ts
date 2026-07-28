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
  verifies?: boolean;
}) {
  const people = {
    findCredentialsByEmail: vi.fn().mockResolvedValue(overrides.credentials ?? null),
    findById: vi.fn().mockResolvedValue(overrides.person ?? person()),
  };
  const clubMemberships = {
    findByPerson: vi.fn().mockResolvedValue(overrides.memberships ?? []),
  };
  const programYears = {
    findCurrent: vi.fn().mockResolvedValue(overrides.currentYear ?? null),
  };
  const orgUnits = {
    findById: vi.fn().mockResolvedValue(overrides.orgUnit ?? null),
  };
  const passwords = {
    verify: vi.fn().mockResolvedValue(overrides.verifies ?? true),
  };
  const session = {
    issue: vi.fn().mockImplementation(async (claims) => `token-for-${JSON.stringify(claims)}`),
  };

  const service = new AuthService(
    people as never,
    clubMemberships as never,
    programYears as never,
    orgUnits as never,
    passwords as never,
    session as never,
  );
  return { service, people, clubMemberships, programYears, orgUnits, passwords, session };
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
      programYearId: '2026-2027',
    });
    expect(session.issue).toHaveBeenCalledWith({
      sub: 'person-1',
      activeUnitId: 'club-B',
      programYearId: '2026-2027',
      v: 4,
    });
  });

  it('logs in fine with no primary membership and no current program year — both nullable', async () => {
    const { service } = makeService({
      credentials: { id: 'person-1', passwordHash: '$argon2id$hash', status: 'active' },
      memberships: [],
      currentYear: null,
    });
    const { session: response } = await service.login('karim@example.com', 'correct');
    expect(response.activeUnitId).toBeNull();
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
