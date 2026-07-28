import { Controller, Get, Query } from '@nestjs/common';
import {
  explainQuerySchema,
  whatCanDoAtQuerySchema,
  whoCanAccessQuerySchema,
  type ExplainResponse,
  type Capability,
  type AccessHolder,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { AccessInspectorRepository } from './access-inspector.repository';

/**
 * rbac-design.md §7.3: the access inspector. Every handler is gated by the
 * same @ResourceScope('platform.audit', 'read') + the global ResourceGuard —
 * no bespoke authorization here. `scope` doubles as the gate's own scope and
 * the query's target scope; for who-can-access ("anywhere"), the caller
 * passes the region root, so only a subtree-covering audit-read grant admits.
 */
@Controller('access/inspector')
export class AccessInspectorController {
  constructor(private readonly inspector: AccessInspectorRepository) {}

  @Get('explain')
  @ResourceScope('platform.audit', 'read')
  async explain(
    @Query(new ZodValidationPipe(explainQuerySchema))
    query: ReturnType<typeof explainQuerySchema.parse>,
  ): Promise<ExplainResponse> {
    const { personLabel, result, text } = await this.inspector.explainAccess(query);
    return { personLabel, allowed: result.decision.allowed, reason: result.decision.reason, text };
  }

  @Get('what-can-do')
  @ResourceScope('platform.audit', 'read')
  async whatCanDo(
    @Query(new ZodValidationPipe(whatCanDoAtQuerySchema))
    query: ReturnType<typeof whatCanDoAtQuerySchema.parse>,
  ): Promise<Capability[]> {
    return this.inspector.whatCanDoAt(query.personId, query.scope);
  }

  @Get('who-can-access')
  @ResourceScope('platform.audit', 'read')
  async whoCanAccess(
    @Query(new ZodValidationPipe(whoCanAccessQuerySchema))
    query: ReturnType<typeof whoCanAccessQuerySchema.parse>,
  ): Promise<AccessHolder[]> {
    return this.inspector.whoCanAccess(query.resource, query.action);
  }
}
