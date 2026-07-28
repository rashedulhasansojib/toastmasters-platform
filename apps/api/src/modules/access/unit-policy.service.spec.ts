import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { UnitPolicyGrant } from '@toastmasters/contracts';
import type { Grant } from '../../common/authz/authz.types';
import { UnitPolicyService } from './unit-policy.service';

function unitPolicyGrant(overrides: Partial<UnitPolicyGrant> = {}): UnitPolicyGrant {
  return {
    id: 'policy-1',
    orgUnitId: 'club-1',
    subjectRole: 'club_member',
    resource: 'meeting.meeting',
    action: 'read',
    condition: 'any',
    effect: 'allow',
    createdBy: 'actor-1',
    createdAt: new Date().toISOString(),
    reason: 'test',
    expiresAt: null,
    ...overrides,
  };
}

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    role: 'unit_admin',
    scope: 'r1.d41.c1',
    resource: 'meeting.meeting',
    action: 'read',
    condition: 'any',
    effect: 'allow',
    ...overrides,
  };
}

function makeService(
  overrides: {
    actorGrants?: Grant[];
    scope?: string;
    remainingUnitAdmins?: number;
  } = {},
) {
  const grantAdmin = {
    createUnitPolicyGrant: vi.fn().mockResolvedValue(unitPolicyGrant()),
    countActiveUnitAdmins: vi.fn().mockResolvedValue(overrides.remainingUnitAdmins ?? 2),
  };
  const accessRepository = {
    effectiveGrants: vi.fn().mockResolvedValue(overrides.actorGrants ?? [grant()]),
    pathOf: vi.fn().mockResolvedValue(overrides.scope ?? 'r1.d41.c1'),
  };

  const service = new UnitPolicyService(grantAdmin as never, accessRepository as never);
  return { service, grantAdmin, accessRepository };
}

describe('UnitPolicyService.create — allow overrides', () => {
  it('delegates to the repository when the actor holds the resource/action being granted', async () => {
    const { service, grantAdmin } = makeService();
    await service.create({
      actorId: 'actor-1',
      orgUnitId: 'club-1',
      subjectRole: 'club_member',
      resource: 'meeting.meeting',
      action: 'read',
      effect: 'allow',
      reason: 'test',
    });
    expect(grantAdmin.createUnitPolicyGrant).toHaveBeenCalledWith({
      orgUnitId: 'club-1',
      subjectRole: 'club_member',
      resource: 'meeting.meeting',
      action: 'read',
      effect: 'allow',
      createdBy: 'actor-1', // mapped from actorId
      reason: 'test',
      expiresAt: undefined,
    });
  });

  it('rejects, without calling the repository, when the actor does not hold the resource/action', async () => {
    const { service, grantAdmin } = makeService({
      actorGrants: [grant({ resource: 'meeting.role', action: 'update' })],
    });
    await expect(
      service.create({
        actorId: 'actor-1',
        orgUnitId: 'club-1',
        subjectRole: 'club_member',
        resource: 'finance.ledger',
        action: 'read',
        effect: 'allow',
        reason: 'test',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(grantAdmin.createUnitPolicyGrant).not.toHaveBeenCalled();
  });
});

describe('UnitPolicyService.create — deny overrides', () => {
  it('never requires the actor to hold the resource/action being denied', async () => {
    const { service, grantAdmin } = makeService({ actorGrants: [] });
    await service.create({
      actorId: 'actor-1',
      orgUnitId: 'club-1',
      subjectRole: 'club_treasurer',
      resource: 'finance.ledger',
      action: 'read',
      effect: 'deny',
      reason: 'test',
    });
    expect(grantAdmin.createUnitPolicyGrant).toHaveBeenCalled();
  });

  it('rejects a self-deny of access.unit_policy:create for unit_admin when it would leave zero other unit_admins', async () => {
    const { service, grantAdmin } = makeService({ remainingUnitAdmins: 1 });
    await expect(
      service.create({
        actorId: 'actor-1',
        orgUnitId: 'club-1',
        subjectRole: 'unit_admin',
        resource: 'access.unit_policy',
        action: 'create',
        effect: 'deny',
        reason: 'test',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(grantAdmin.createUnitPolicyGrant).not.toHaveBeenCalled();
    expect(grantAdmin.countActiveUnitAdmins).toHaveBeenCalled();
  });

  it('allows the same self-deny when at least one other unit_admin remains', async () => {
    const { service, grantAdmin } = makeService({ remainingUnitAdmins: 2 });
    await service.create({
      actorId: 'actor-1',
      orgUnitId: 'club-1',
      subjectRole: 'unit_admin',
      resource: 'access.unit_policy',
      action: 'create',
      effect: 'deny',
      reason: 'test',
    });
    expect(grantAdmin.createUnitPolicyGrant).toHaveBeenCalled();
  });

  it('never runs the last-admin check for a deny targeting a different subject/resource/action', async () => {
    const { service, grantAdmin } = makeService({ remainingUnitAdmins: 1 });
    await service.create({
      actorId: 'actor-1',
      orgUnitId: 'club-1',
      subjectRole: 'club_member',
      resource: 'meeting.meeting',
      action: 'read',
      effect: 'deny',
      reason: 'test',
    });
    expect(grantAdmin.countActiveUnitAdmins).not.toHaveBeenCalled();
    expect(grantAdmin.createUnitPolicyGrant).toHaveBeenCalled();
  });
});
