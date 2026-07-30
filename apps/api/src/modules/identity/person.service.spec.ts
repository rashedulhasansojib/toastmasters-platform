import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
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
  } = {},
) {
  const people = {
    search: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findDetail: vi
      .fn()
      .mockResolvedValue('detailResult' in overrides ? overrides.detailResult : detail()),
    update: vi.fn().mockResolvedValue(person()),
    create: vi.fn().mockResolvedValue(person()),
    isWithinSubtree: vi.fn().mockResolvedValue(overrides.withinSubtree ?? true),
  };
  const orgUnits = {
    findById: vi.fn().mockResolvedValue('anchor' in overrides ? overrides.anchor : orgUnit()),
    findAncestors: vi.fn().mockResolvedValue([]),
  };
  const invitations = {
    create: vi.fn().mockResolvedValue(invitation()),
  };

  const service = new PersonService(people as never, orgUnits as never, invitations as never);
  return { service, people, orgUnits, invitations };
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
