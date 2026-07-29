import { Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import type { PlatformConsoleSummary } from '@toastmasters/contracts';
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
}
