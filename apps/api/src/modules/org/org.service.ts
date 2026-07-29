import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { orgUnitTierRank, type OrgUnit, type OrgUnitType } from '@toastmasters/contracts';
import { canDelegate } from '../../common/authz/can-delegate';
import { AccessRepository } from '../access/access.repository';
import { OrgUnitRepository } from './org.repository';

/** Prisma raises P2003 for a foreign-key violation; raw-SQL deletes surface the Postgres code (23503) instead. */
function isForeignKeyViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'P2003' || code === '23503';
}

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
    const parent = await this.orgUnits.findById(input.parentId);
    if (!parent) throw new NotFoundException('Parent org unit not found');
    if (orgUnitTierRank[input.type] <= orgUnitTierRank[parent.type]) {
      throw new BadRequestException(
        `A ${input.type} cannot sit under a ${parent.type} — a child must be a deeper tier`,
      );
    }
    return this.orgUnits.createChild(input);
  }

  async update(input: {
    actorId: string;
    orgUnitId: string;
    name?: string;
    timezone?: string;
  }): Promise<OrgUnit> {
    const unit = await this.orgUnits.findById(input.orgUnitId);
    if (!unit) throw new NotFoundException('Org unit not found');
    return this.orgUnits.update(
      input.orgUnitId,
      { name: input.name, timezone: input.timezone },
      input.actorId,
    );
  }

  /**
   * Hard delete, empty units only (CLAUDE.md §2, product decision 2026-07-29).
   * The pre-check exists to give a useful 409 listing what is in the way; the
   * foreign keys behind it are what actually guarantee no history is lost, so
   * an FK violation is caught and reported rather than surfaced as a 500.
   */
  async remove(input: { actorId: string; orgUnitId: string }): Promise<void> {
    const unit = await this.orgUnits.findById(input.orgUnitId);
    if (!unit) throw new NotFoundException('Org unit not found');
    if (unit.parentId === null) {
      throw new ConflictException('The region root cannot be deleted');
    }

    const blockers = await this.orgUnits.deleteBlockers(input.orgUnitId);
    if (blockers.length > 0) {
      throw new ConflictException({
        message: 'Unit is not empty',
        blockers,
      });
    }

    try {
      await this.orgUnits.remove(input.orgUnitId, input.actorId);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('Unit still has records attached and cannot be deleted');
      }
      throw error;
    }
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
