import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { InvitationWithLink, OrgUnit, Person, PersonDetail } from '@toastmasters/contracts';
import { PersonService } from './person.service';

function orgUnit(overrides: Partial<OrgUnit> = {}): OrgUnit {
  return {
    id: 'district-1',
    type: 'district',
    parentId: 'region-1',
    path: 'r1.d41',
    depth: 1,
    name: 'District 41',
    code: 'd41',
    status: 'active',
    timezone: 'UTC',
    ...overrides,
  };
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    email: 'newcomer@example.com',
    fullName: 'Newcomer Person',
    phone: null,
    photoUrl: null,
    bio: null,
    tiMemberNumber: null,
    status: 'invited',
    mfaEnabled: false,
    permissionVersion: 1,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function detail(overrides: Partial<PersonDetail> = {}): PersonDetail {
  return {
    ...person(),
    clubMemberships: [],
    roleAssignments: [],
    platformRoles: [],
    pendingInvitation: null,
    ...overrides,
  };
}

function invitation(): InvitationWithLink {
  return {
    id: 'invitation-1',
    email: 'newcomer@example.com',
    orgUnitId: 'club-1',
    role: 'club_president',
    memberType: null,
    programYearId: '2026-2027',
    invitedBy: 'actor-1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    acceptedPersonId: null,
    inviteUrl: 'http://localhost:3000/invitations/raw-token/accept',
  };
}

function makeService(
  overrides: {
    anchor?: OrgUnit | null;
    withinSubtree?: boolean;
    detailResult?: PersonDetail | null;
    personById?: Person | null;
  } = {},
) {
  const people = {
    search: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findDetail: vi
      .fn()
      .mockResolvedValue('detailResult' in overrides ? overrides.detailResult : detail()),
    findById: vi
      .fn()
      .mockResolvedValue('personById' in overrides ? overrides.personById : person()),
    update: vi.fn().mockResolvedValue(person()),
    create: vi.fn().mockResolvedValue(person()),
    isWithinSubtree: vi.fn().mockResolvedValue(overrides.withinSubtree ?? true),
    setPassword: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
  };
  const orgUnits = {
    findById: vi.fn().mockResolvedValue('anchor' in overrides ? overrides.anchor : orgUnit()),
    findAncestors: vi.fn().mockResolvedValue([]),
  };
  const invitations = {
    create: vi.fn().mockResolvedValue(invitation()),
  };
  const passwords = {
    hash: vi.fn().mockResolvedValue('$argon2id$hash'),
  };
  const roleTemplates = {
    findByRole: vi.fn().mockResolvedValue({
      role: 'system_admin',
      tier: 'platform',
      unitTypes: [],
      isSingleton: false,
      label: 'System Administrator',
    }),
  };
  const grantAdmin = {
    grantPlatformRole: vi.fn().mockResolvedValue({
      id: 'platform-role-assignment-1',
      personId: 'person-1',
      role: 'system_admin',
      orgUnitId: null,
      grantedBy: 'actor-1',
      grantedAt: new Date(),
      expiresAt: null,
    }),
    revokePlatformRole: vi.fn().mockResolvedValue(undefined),
  };
  // A grant covering every scope this test file uses, so canDelegate() (a
  // real, unmocked import) passes by default — tests that need to see it
  // fail override effectiveGrants to return [].
  const accessRepository = {
    effectiveGrants: vi.fn().mockResolvedValue([
      {
        role: 'system_admin',
        scope: 'r1',
        resource: 'access.platform_role',
        action: 'create',
        condition: 'any',
        effect: 'allow',
      },
      {
        role: 'system_admin',
        scope: 'r1',
        resource: 'access.platform_role',
        action: 'delete',
        condition: 'any',
        effect: 'allow',
      },
    ]),
    pathOf: vi.fn().mockResolvedValue('r1'),
    regionRootPath: vi.fn().mockResolvedValue('r1'),
  };

  const service = new PersonService(
    people as never,
    orgUnits as never,
    invitations as never,
    passwords as never,
    roleTemplates as never,
    grantAdmin as never,
    accessRepository as never,
  );
  return {
    service,
    people,
    orgUnits,
    invitations,
    passwords,
    roleTemplates,
    grantAdmin,
    accessRepository,
  };
}

describe('PersonService.search', () => {
  it('404s when the anchor org unit does not exist', async () => {
    const { service } = makeService({ anchor: null });
    await expect(
      service.search({ anchorOrgUnitId: 'missing', limit: 25, offset: 0 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('passes isRegionRoot: true only when the anchor is the region', async () => {
    const { service, people } = makeService({ anchor: orgUnit({ type: 'region', path: 'r1' }) });
    await service.search({ anchorOrgUnitId: 'region-1', limit: 25, offset: 0 });
    expect(people.search).toHaveBeenCalledWith(
      expect.objectContaining({ isRegionRoot: true, subtreePath: 'r1' }),
    );
  });

  it('passes isRegionRoot: false for a district anchor', async () => {
    const { service, people } = makeService();
    await service.search({ anchorOrgUnitId: 'district-1', limit: 25, offset: 0 });
    expect(people.search).toHaveBeenCalledWith(
      expect.objectContaining({ isRegionRoot: false, subtreePath: 'r1.d41' }),
    );
  });
});

describe('PersonService.getDetail / update', () => {
  it('returns detail when the anchor is the region root, regardless of subtree', async () => {
    const { service, people } = makeService({ anchor: orgUnit({ type: 'region', path: 'r1' }) });
    await service.getDetail('person-1', 'region-1');
    expect(people.isWithinSubtree).not.toHaveBeenCalled();
  });

  it("404s a person outside a district-scoped anchor's subtree", async () => {
    const { service } = makeService({ withinSubtree: false });
    await expect(service.getDetail('person-1', 'district-1')).rejects.toThrow(NotFoundException);
  });

  it('returns detail for a person inside the anchor subtree', async () => {
    const { service } = makeService({ withinSubtree: true });
    const result = await service.getDetail('person-1', 'district-1');
    expect(result.id).toBe('person-1');
  });

  it('update() 404s the same way as getDetail() for an out-of-subtree person', async () => {
    const { service } = makeService({ withinSubtree: false });
    await expect(
      service.update('person-1', 'district-1', { fullName: 'New Name' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('update() 404s when the person is already soft-deleted (findById returns null)', async () => {
    const { service } = makeService({ withinSubtree: true, personById: null });
    await expect(
      service.update('person-1', 'district-1', { fullName: 'New Name' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('PersonService.setPassword', () => {
  it('hashes with argon2id and delegates to the repository', async () => {
    const { service, people, passwords } = makeService();
    await service.setPassword('person-1', 'district-1', 'new-password-1', 'actor-1');
    expect(passwords.hash).toHaveBeenCalledWith('new-password-1');
    expect(people.setPassword).toHaveBeenCalledWith('person-1', '$argon2id$hash', 'actor-1');
  });

  it('404s for an out-of-subtree target and never hashes', async () => {
    const { service, passwords, people } = makeService({ withinSubtree: false });
    await expect(
      service.setPassword('person-1', 'district-1', 'new-password-1', 'actor-1'),
    ).rejects.toThrow(NotFoundException);
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(people.setPassword).not.toHaveBeenCalled();
  });

  it('404s a soft-deleted target and never hashes', async () => {
    const { service, passwords, people } = makeService({ personById: null });
    await expect(
      service.setPassword('person-1', 'district-1', 'new-password-1', 'actor-1'),
    ).rejects.toThrow(NotFoundException);
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(people.setPassword).not.toHaveBeenCalled();
  });
});

describe('PersonService.softDelete', () => {
  it('passes the target email through so the repo can revoke pending invitations', async () => {
    const { service, people } = makeService({
      personById: person({ email: 'target@example.com' }),
    });
    await service.softDelete('person-1', 'district-1', 'actor-1');
    expect(people.softDelete).toHaveBeenCalledWith('person-1', 'target@example.com', 'actor-1');
  });

  it('404s for an out-of-subtree target and never soft-deletes', async () => {
    const { service, people } = makeService({ withinSubtree: false });
    await expect(service.softDelete('person-1', 'district-1', 'actor-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(people.softDelete).not.toHaveBeenCalled();
  });

  it('404s an already-deleted target (findById returns null) and never soft-deletes again', async () => {
    const { service, people } = makeService({ personById: null });
    await expect(service.softDelete('person-1', 'district-1', 'actor-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(people.softDelete).not.toHaveBeenCalled();
  });
});

describe('PersonService.createWithOptionalInvite', () => {
  it('creates a bare person when no invite is requested', async () => {
    const { service, people, invitations } = makeService();
    const result = await service.createWithOptionalInvite({
      actorId: 'actor-1',
      request: { fullName: 'Newcomer Person', email: 'newcomer@example.com' },
    });
    expect(people.create).toHaveBeenCalled();
    expect(invitations.create).not.toHaveBeenCalled();
    expect(result.invitation).toBeNull();
  });

  it('creates a person and an invitation when invite is provided', async () => {
    const { service, invitations } = makeService();
    const result = await service.createWithOptionalInvite({
      actorId: 'actor-1',
      request: {
        fullName: 'Newcomer Person',
        email: 'newcomer@example.com',
        invite: { orgUnitId: 'club-1', role: 'club_president', programYearId: '2026-2027' },
      },
    });
    expect(invitations.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'actor-1', orgUnitId: 'club-1', role: 'club_president' }),
    );
    expect(result.invitation?.inviteUrl).toContain('/accept');
  });
});

describe('PersonService.grantPlatformRole', () => {
  it('grants system_admin with no org unit and returns the badge', async () => {
    const { service, grantAdmin } = makeService();
    const badge = await service.grantPlatformRole('person-1', { role: 'system_admin' }, 'actor-1');
    expect(grantAdmin.grantPlatformRole).toHaveBeenCalledWith(
      expect.objectContaining({ personId: 'person-1', role: 'system_admin', orgUnitId: null }),
    );
    expect(badge.role).toBe('system_admin');
  });

  it('rejects an unknown or non-platform-tier role', async () => {
    const { service, roleTemplates } = makeService();
    roleTemplates.findByRole.mockResolvedValueOnce(null);
    await expect(
      service.grantPlatformRole('person-1', { role: 'not_a_role' }, 'actor-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects system_admin scoped to an org unit', async () => {
    const { service } = makeService();
    await expect(
      service.grantPlatformRole(
        'person-1',
        { role: 'system_admin', orgUnitId: 'club-1' },
        'actor-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a subtree-scoped platform role with no org unit', async () => {
    const { service, roleTemplates } = makeService();
    roleTemplates.findByRole.mockResolvedValueOnce({
      role: 'unit_admin',
      tier: 'platform',
      unitTypes: [],
      isSingleton: false,
      label: 'Unit Administrator',
    });
    await expect(
      service.grantPlatformRole('person-1', { role: 'unit_admin' }, 'actor-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('404s when the target person does not exist', async () => {
    const { service } = makeService({ personById: null });
    await expect(
      service.grantPlatformRole('missing', { role: 'system_admin' }, 'actor-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('403s when the actor does not hold access.platform_role:create at this scope', async () => {
    const { service, accessRepository } = makeService();
    accessRepository.effectiveGrants.mockResolvedValueOnce([]);
    await expect(
      service.grantPlatformRole('person-1', { role: 'system_admin' }, 'actor-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('PersonService.revokePlatformRole', () => {
  it('delegates to GrantAdminRepository once the badge is found on the person', async () => {
    const { service, grantAdmin } = makeService({
      detailResult: detail({
        platformRoles: [
          {
            platformRoleAssignmentId: 'platform-role-assignment-1',
            role: 'system_admin',
            orgUnitId: null,
            orgUnitName: null,
          },
        ],
      }),
    });
    await service.revokePlatformRole('person-1', 'platform-role-assignment-1', 'actor-1');
    expect(grantAdmin.revokePlatformRole).toHaveBeenCalledWith(
      'platform-role-assignment-1',
      'actor-1',
    );
  });

  it('404s when the target person does not exist', async () => {
    const { service, grantAdmin } = makeService({ detailResult: null });
    await expect(
      service.revokePlatformRole('missing', 'platform-role-assignment-1', 'actor-1'),
    ).rejects.toThrow(NotFoundException);
    expect(grantAdmin.revokePlatformRole).not.toHaveBeenCalled();
  });

  it("404s when the assignment id does not belong to this person's platform roles", async () => {
    const { service, grantAdmin } = makeService({ detailResult: detail({ platformRoles: [] }) });
    await expect(
      service.revokePlatformRole('person-1', 'someone-elses-assignment', 'actor-1'),
    ).rejects.toThrow(NotFoundException);
    expect(grantAdmin.revokePlatformRole).not.toHaveBeenCalled();
  });

  it('403s when the actor does not hold access.platform_role:delete at this scope', async () => {
    const { service, accessRepository } = makeService({
      detailResult: detail({
        platformRoles: [
          {
            platformRoleAssignmentId: 'platform-role-assignment-1',
            role: 'system_admin',
            orgUnitId: null,
            orgUnitName: null,
          },
        ],
      }),
    });
    accessRepository.effectiveGrants.mockResolvedValueOnce([]);
    await expect(
      service.revokePlatformRole('person-1', 'platform-role-assignment-1', 'actor-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});
