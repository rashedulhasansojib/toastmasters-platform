import { ForbiddenException, Injectable } from '@nestjs/common';
import type { OrgUnit, OrgUnitType } from '@toastmasters/contracts';
import { canDelegate } from '../../common/authz/can-delegate';
import { AccessRepository } from '../access/access.repository';
import { OrgUnitRepository } from './org.repository';

/**
 * M2 Slice 2: system-design.md §5.1/FR-ORG-3. `reparent()` layers a second,
 * destination-scoped canDelegate check beyond the route's own @ResourceScope
 * guard (which only checks authority over the node being moved) — otherwise
 * an actor could move a unit they administer into a subtree they have no
 * authority over. Mirrors InvitationService.create()'s outer-guard-plus-
 * inner-canDelegate shape from Slice 1.
 */
@Injectable()
export class OrgUnitService {
  constructor(
    private readonly orgUnits: OrgUnitRepository,
    private readonly accessRepository: AccessRepository,
  ) {}

  async createChild(input: {
    parentId: string;
    type: OrgUnitType;
    name: string;
    code: string;
    timezone: string;
  }): Promise<OrgUnit> {
    return this.orgUnits.createChild(input);
  }

  async reparent(input: {
    actorId: string;
    orgUnitId: string;
    newParentId: string;
  }): Promise<void> {
    const [actorGrants, destinationScope] = await Promise.all([
      this.accessRepository.effectiveGrants(input.actorId),
      this.accessRepository.pathOf(input.newParentId),
    ]);
    if (
      !canDelegate(actorGrants, {
        resource: 'org.unit',
        action: 'create',
        scope: destinationScope,
      })
    ) {
      throw new ForbiddenException('Cannot reparent into a unit you do not hold authority over');
    }
    await this.orgUnits.reparent(input.orgUnitId, input.newParentId, input.actorId);
  }
}
