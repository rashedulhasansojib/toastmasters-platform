import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createOrgUnitRootRequestSchema,
  orgTreeQuerySchema,
  type CreateOrgUnitRootRequest,
  type OrgTreeLevel,
  type OrgTreeQuery,
  type OrgUnit,
  type PlatformConsoleSummary,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { PlatformConsoleService } from './platform-console.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * The super-admin dashboard's read surface.
 *
 * Authorization is the ordinary gate, not a special case: @ResourceScope
 * resolves `regionUnitId` to its ltree path and defers to authorize(). Only
 * `system_admin` holds `platform.console`/`read`, because no role template
 * grants it and system_admin alone gets the broad non-restricted synthesis.
 * A club officer hitting this route gets a default-deny 403.
 */
@Controller()
export class PlatformConsoleController {
  constructor(private readonly console: PlatformConsoleService) {}

  @Get('platform/:regionUnitId/console')
  @ResourceScope('platform.console', 'read', { source: 'param', key: 'regionUnitId' })
  async summary(
    @Param('regionUnitId', uuidPipe) regionUnitId: string,
  ): Promise<PlatformConsoleSummary> {
    return this.console.summary(regionUnitId);
  }

  /**
   * The org-tree browser: one level at a time (roots, or a unit's direct
   * children), card-shaped with counts. `regionUnitId` only anchors the
   * authorization check — the tree itself isn't per-region.
   */
  @Get('platform/:regionUnitId/org-tree')
  @ResourceScope('platform.console', 'read', { source: 'param', key: 'regionUnitId' })
  async orgTree(
    @Param('regionUnitId', uuidPipe) _regionUnitId: string,
    @Query(new ZodValidationPipe(orgTreeQuerySchema)) query: OrgTreeQuery,
  ): Promise<OrgTreeLevel> {
    return this.console.browseOrgTree(query.parentId);
  }

  /**
   * "Add new Region" at the top of the browser. Gated on `org.unit`/`create`
   * (already granted to system_admin and unit_admin) rather than
   * `platform.console` — a root has no parent to check authority against, so
   * `regionUnitId` stands in for scope resolution the same way it does above.
   */
  @Post('platform/:regionUnitId/org-tree/regions')
  @ResourceScope('org.unit', 'create', { source: 'param', key: 'regionUnitId' })
  async createRegion(
    @Param('regionUnitId', uuidPipe) _regionUnitId: string,
    @Body(new ZodValidationPipe(createOrgUnitRootRequestSchema)) body: CreateOrgUnitRootRequest,
  ): Promise<OrgUnit> {
    return this.console.createRegionRoot(body);
  }
}
