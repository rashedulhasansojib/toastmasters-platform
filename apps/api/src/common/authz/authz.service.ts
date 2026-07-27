import { Injectable } from '@nestjs/common';
import type { AccessDecision, AccessRequest, Grant } from './authz.types';
import { evaluate } from './evaluate';

@Injectable()
export class AuthzService {
  /**
   * Resolve the grants that apply to a request.
   *
   * Greenfield state: no role templates are seeded and no assignments exist, so
   * the effective grant set is empty and every authorize() call denies by
   * default — which is exactly correct. M1 adds the RBAC tables
   * (resource_catalog, role_template, role_assignment) and a repository that
   * resolves real grants here. This is a deliberate default, not a stub: the
   * evaluation below is complete and unit-tested.
   */
  async effectiveGrants(_request: AccessRequest): Promise<Grant[]> {
    return [];
  }

  /** The one authorization gate. Everything funnels through here (default-deny). */
  async authorize(request: AccessRequest): Promise<AccessDecision> {
    const grants = await this.effectiveGrants(request);
    return evaluate(grants, request);
  }

  /**
   * Access inspector: the decision plus the grants that were considered — the
   * "why can Karim see the ledger?" trace from rbac-design.md. Ships with the
   * engine so any decision is auditable.
   */
  async explain(
    request: AccessRequest,
  ): Promise<{ decision: AccessDecision; considered: Grant[] }> {
    const considered = await this.effectiveGrants(request);
    return { decision: evaluate(considered, request), considered };
  }
}
