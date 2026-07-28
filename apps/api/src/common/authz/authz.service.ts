import { Injectable } from '@nestjs/common';
import type { AccessDecision, AccessRequest, Grant } from './authz.types';
import { evaluate } from './evaluate';
import { AccessRepository } from '../../modules/access/access.repository';

@Injectable()
export class AuthzService {
  constructor(private readonly accessRepository: AccessRepository) {}

  /** Resolve the grants that apply to a request (rbac-design.md §4.2). */
  async effectiveGrants(request: AccessRequest): Promise<Grant[]> {
    return this.accessRepository.effectiveGrants(request.principal.userId);
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
