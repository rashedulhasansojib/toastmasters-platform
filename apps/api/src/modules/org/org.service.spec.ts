import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OrgUnit } from '@toastmasters/contracts';
import type { Grant } from '../../common/authz/authz.types';
import { OrgUnitService } from './org.service';

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
    timezone: 'Asia/Dhaka',
    ...overrides,
  };
}

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    role: 'unit_admin',
    scope: 'r1.d41',
    resource: 'org.unit',
    action: 'create',
    condition: 'any',
    effect: 'allow',
    ...overrides,
  };
}

function makeService(
  overrides: {
    actorGrants?: Grant[];
    destinationScope?: string;
    parent?: OrgUnit;
  } = {},
) {
  const orgUnits = {
    createChild: vi.fn().mockResolvedValue(orgUnit()),
    reparent: vi.fn().mockResolvedValue(undefined),
    findById: vi
      .fn()
      .mockResolvedValue(
        overrides.parent ??
          orgUnit({ id: 'district-1', type: 'district', path: 'r1.d41', depth: 1, code: 'd41' }),
      ),
  };
  const accessRepository = {
    effectiveGrants: vi.fn().mockResolvedValue(overrides.actorGrants ?? [grant()]),
    pathOf: vi.fn().mockResolvedValue(overrides.destinationScope ?? 'r1.d41'),
  };

  const service = new OrgUnitService(orgUnits as never, accessRepository as never);
  return { service, orgUnits, accessRepository };
}

describe('OrgUnitService.createChild', () => {
  it('delegates to the repository when the child is a deeper tier than the parent', async () => {
    const { service, orgUnits } = makeService();
    const input = {
      parentId: 'district-1',
      type: 'club' as const,
      name: 'Club 1',
      code: 'c1',
      timezone: 'Asia/Dhaka',
    };
    const result = await service.createChild(input);
    expect(orgUnits.createChild).toHaveBeenCalledWith(input);
    expect(result.id).toBe('club-1');
  });

  it('rejects a child at or above the parent tier, without calling the repository', async () => {
    const { service, orgUnits } = makeService({
      parent: orgUnit({ id: 'club-1', type: 'club' }),
    });
    await expect(
      service.createChild({
        parentId: 'club-1',
        type: 'district',
        name: 'District under a club',
        code: 'd99',
        timezone: 'Asia/Dhaka',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(orgUnits.createChild).not.toHaveBeenCalled();
  });

  it('404s when the parent does not exist', async () => {
    const { service, orgUnits } = makeService();
    orgUnits.findById.mockResolvedValueOnce(null);
    await expect(
      service.createChild({
        parentId: 'nope',
        type: 'club',
        name: 'Orphan',
        code: 'c9',
        timezone: 'Asia/Dhaka',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(orgUnits.createChild).not.toHaveBeenCalled();
  });
});

describe('OrgUnitService.reparent', () => {
  it('delegates to the repository when the actor holds org.unit:create at the destination', async () => {
    const { service, orgUnits } = makeService();
    await service.reparent({ actorId: 'admin-1', orgUnitId: 'club-1', newParentId: 'district-2' });
    expect(orgUnits.reparent).toHaveBeenCalledWith('club-1', 'district-2', 'admin-1');
  });

  it('rejects, without calling the repository, when the actor holds no authority at the destination', async () => {
    const { service, orgUnits } = makeService({
      actorGrants: [grant({ scope: 'r1.d99' })], // authority over a different district entirely
      destinationScope: 'r1.d41',
    });
    await expect(
      service.reparent({ actorId: 'admin-1', orgUnitId: 'club-1', newParentId: 'district-2' }),
    ).rejects.toThrow(ForbiddenException);
    expect(orgUnits.reparent).not.toHaveBeenCalled();
  });
});
