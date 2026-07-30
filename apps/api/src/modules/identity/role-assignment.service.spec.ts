import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type {
  ClubMembership,
  OrgUnit,
  RoleAssignment,
  RoleTemplateSummary,
} from '@toastmasters/contracts';
import type { Grant } from '../../common/authz/authz.types';
import { RoleAssignmentService } from './role-assignment.service';

function orgUnit(overrides: Partial<OrgUnit> = {}): OrgUnit {
  return {
    id: 'club-1',
    type: 'club',
    parentId: 'district-1',
    path: 'r1.d41.c1',
    depth: 2,
    name: 'Club 1',
    code: 'c1',
    status: 'active',
    timezone: 'UTC',
    ...overrides,
  };
}

function template(overrides: Partial<RoleTemplateSummary> = {}): RoleTemplateSummary {
  return {
    role: 'club_president',
    tier: 'club',
    unitTypes: ['club'],
    isSingleton: true,
    label: 'Club President',
    ...overrides,
  };
}

function roleAssignment(overrides: Partial<RoleAssignment> = {}): RoleAssignment {
  return {
    id: 'ra-1',
    personId: 'person-1',
    orgUnitId: 'club-1',
    role: 'club_president',
    programYearId: '2026-2027',
    termStart: '2026-07-01',
    termEnd: '2027-06-30',
    status: 'active',
    appointedBy: 'actor-1',
    appointedAt: new Date().toISOString(),
    trainedAt: [],
    endedReason: null,
    ...overrides,
  };
}

function membership(overrides: Partial<ClubMembership> = {}): ClubMembership {
  return {
    id: 'cm-1',
    personId: 'person-1',
    clubUnitId: 'club-1',
    memberType: 'new',
    joinedAt: new Date().toISOString(),
    leftAt: null,
    isPrimary: false,
    tiStanding: 'unknown',
    localStatus: 'active',
    provenance: 'portal',
    lastReconciledAt: null,
    ...overrides,
  };
}

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    role: 'unit_admin',
    scope: 'r1.d41',
    resource: 'identity.role_assignment',
    action: 'update',
    condition: 'any',
    effect: 'allow',
    ...overrides,
  };
}

function makeService(
  overrides: {
    orgUnit?: OrgUnit | null;
    template?: RoleTemplateSummary | null;
    memberships?: ClubMembership[];
    actorGrants?: Grant[];
    scope?: string;
    findByIdResult?: RoleAssignment | null;
  } = {},
) {
  const roleAssignments = {
    assign: vi.fn().mockResolvedValue(roleAssignment()),
    end: vi.fn().mockResolvedValue(undefined),
    findById: vi
      .fn()
      .mockResolvedValue(
        'findByIdResult' in overrides ? overrides.findByIdResult : roleAssignment(),
      ),
  };
  const roleTemplates = {
    findByRole: vi
      .fn()
      .mockResolvedValue('template' in overrides ? overrides.template : template()),
  };
  const orgUnits = {
    findById: vi.fn().mockResolvedValue('orgUnit' in overrides ? overrides.orgUnit : orgUnit()),
  };
  const clubMemberships = {
    findByPerson: vi.fn().mockResolvedValue(overrides.memberships ?? [membership()]),
  };
  const accessRepository = {
    effectiveGrants: vi.fn().mockResolvedValue(overrides.actorGrants ?? [grant()]),
    pathOf: vi.fn().mockResolvedValue(overrides.scope ?? 'r1.d41.c1'),
  };

  const service = new RoleAssignmentService(
    roleAssignments as never,
    roleTemplates as never,
    orgUnits as never,
    clubMemberships as never,
    accessRepository as never,
  );
  return { service, roleAssignments, roleTemplates, orgUnits, clubMemberships, accessRepository };
}

describe('RoleAssignmentService.assign', () => {
  const baseInput = {
    actorId: 'actor-1',
    personId: 'person-1',
    orgUnitId: 'club-1',
    role: 'club_president',
    programYearId: '2026-2027',
    termStart: new Date('2026-07-01'),
    termEnd: new Date('2027-06-30'),
    memberType: 'new' as const,
  };

  it('404s when the target org unit does not exist', async () => {
    const { service } = makeService({ orgUnit: null });
    await expect(service.assign(baseInput)).rejects.toThrow(NotFoundException);
  });

  it('400s on an unknown role', async () => {
    const { service } = makeService({ template: null });
    await expect(service.assign(baseInput)).rejects.toThrow(BadRequestException);
  });

  it('400s when the role template is bound to a different tier than the target unit', async () => {
    // Target unit is still the default club (orgUnit()'s type: 'club'), but the
    // role template is district-tier-only — the mismatch is what's under test.
    const { service } = makeService({
      template: template({ role: 'district_director', tier: 'district', unitTypes: ['district'] }),
    });
    await expect(
      service.assign({ ...baseInput, role: 'district_director', memberType: undefined }),
    ).rejects.toThrow(BadRequestException);
  });

  it('400s when a club-tier role is assigned with no memberType', async () => {
    const { service } = makeService();
    await expect(service.assign({ ...baseInput, memberType: undefined })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('creates the assignment and upserts membership when a club-tier role includes memberType', async () => {
    const { service, roleAssignments } = makeService();
    const result = await service.assign(baseInput);
    expect(roleAssignments.assign).toHaveBeenCalledWith(
      expect.objectContaining({ memberType: 'new', appointedBy: 'actor-1' }),
    );
    expect(result.warnings).toEqual([]);
  });

  it('warns, but still creates, a director-tier assignment for a person with no active club membership', async () => {
    const { service } = makeService({
      orgUnit: orgUnit({ type: 'area', id: 'area-1' }),
      template: template({ role: 'area_director', tier: 'area', unitTypes: ['area'] }),
      memberships: [membership({ localStatus: 'inactive' })],
    });
    const result = await service.assign({
      ...baseInput,
      orgUnitId: 'area-1',
      role: 'area_director',
      memberType: undefined,
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('assigns a director-tier role with no warning when the person already holds an active club membership', async () => {
    const { service } = makeService({
      orgUnit: orgUnit({ type: 'area', id: 'area-1' }),
      template: template({ role: 'area_director', tier: 'area', unitTypes: ['area'] }),
      memberships: [membership({ localStatus: 'active' })],
    });
    const result = await service.assign({
      ...baseInput,
      orgUnitId: 'area-1',
      role: 'area_director',
      memberType: undefined,
    });
    expect(result.warnings).toEqual([]);
  });
});

describe('RoleAssignmentService.end', () => {
  it('ends the assignment when the actor can delegate at its scope', async () => {
    const { service, roleAssignments } = makeService();
    await service.end('ra-1', 'resigned', 'actor-1');
    expect(roleAssignments.end).toHaveBeenCalledWith('ra-1', 'resigned', 'actor-1');
  });

  it('403s an actor who cannot delegate identity.role_assignment:update at the assignment scope', async () => {
    const { service } = makeService({
      actorGrants: [grant({ resource: 'meeting.meeting', action: 'read' })],
    });
    await expect(service.end('ra-1', 'resigned', 'actor-1')).rejects.toThrow(ForbiddenException);
  });

  it('404s an unknown role assignment id', async () => {
    const { service } = makeService({ findByIdResult: null });
    await expect(service.end('missing', 'resigned', 'actor-1')).rejects.toThrow(NotFoundException);
  });
});
