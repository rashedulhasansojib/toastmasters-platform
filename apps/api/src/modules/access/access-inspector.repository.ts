import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import { explain, renderExplain, type ExplainResult } from '../../common/authz/explain';
import { evaluate } from '../../common/authz/evaluate';
import type { Action, AccessRequest, Condition } from '../../common/authz/authz.types';
import { AccessRepository } from './access.repository';
import { PRISMA_CLIENT } from './prisma-client.token';

function notExpired() {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

export interface WhoCanAccessEntry {
  personId: string;
  fullName: string;
  scope: string;
  via: string;
}

/**
 * The access inspector (rbac-design.md §7.3): forward explanation and the two
 * reverse queries. Read-only — never used to authorize a request, only to
 * explain a decision that AuthzService.authorize() already owns.
 */
@Injectable()
export class AccessInspectorRepository {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma(),
    private readonly accessRepository: AccessRepository = new AccessRepository(),
  ) {}

  /** "Why can Karim read the ledger?" */
  async explainAccess(input: {
    personId: string;
    resource: string;
    action: Action;
    scope: string;
  }): Promise<{ personLabel: string; result: ExplainResult; text: string }> {
    const [person, grants] = await Promise.all([
      this.db.person.findUniqueOrThrow({
        where: { id: input.personId },
        select: { fullName: true },
      }),
      this.accessRepository.effectiveGrants(input.personId),
    ]);
    const request: AccessRequest = {
      principal: { userId: input.personId, roles: [], scopes: [] },
      resource: input.resource,
      action: input.action,
      scope: input.scope,
    };
    const result = explain(grants, request);
    return {
      personLabel: person.fullName,
      result,
      text: renderExplain(person.fullName, request, result),
    };
  }

  /**
   * "Show everything Karim can do at Club 1234." Probes every distinct
   * resource:action pair the person holds anywhere with all context flags
   * true — a capability check ("could this ever apply here"), not a
   * row-specific decision. Condition-gated grants (e.g. `own`) still surface,
   * matching §7.3's "show everything" framing.
   */
  async whatCanDoAt(
    personId: string,
    scope: string,
  ): Promise<Array<{ resource: string; action: Action; condition: Condition }>> {
    const grants = await this.accessRepository.effectiveGrants(personId);
    const pairs = new Map<string, { resource: string; action: Action; condition: Condition }>();
    for (const g of grants) {
      pairs.set(`${g.resource}:${g.action}`, {
        resource: g.resource,
        action: g.action,
        condition: g.condition,
      });
    }

    const out: Array<{ resource: string; action: Action; condition: Condition }> = [];
    for (const pair of pairs.values()) {
      const decision = evaluate(grants, {
        principal: { userId: personId, roles: [], scopes: [] },
        resource: pair.resource,
        action: pair.action,
        scope,
        context: { isOwner: true, isAssigned: true, isParty: true, isPublished: true },
      });
      if (decision.allowed) out.push(pair);
    }
    return out;
  }

  /**
   * "Show everyone who can read finance.ledger anywhere." Enumerates holders
   * of an *allow* grant for resource:action across all four sources — it does
   * not reconcile a `deny` override that might sit on top of one of them
   * elsewhere (see the Slice 7 plan's scoping note). Good enough for an
   * access review; not a per-person authorize() call.
   */
  async whoCanAccess(resource: string, action: Action): Promise<WhoCanAccessEntry[]> {
    const [roleHolders, platformHolders, policyHolders, directHolders] = await Promise.all([
      this.domainRoleHolders(resource, action),
      this.platformRoleHolders(resource, action),
      this.unitPolicyHolders(resource, action),
      this.directGrantHolders(resource, action),
    ]);
    const all = [...roleHolders, ...platformHolders, ...policyHolders, ...directHolders];

    const seen = new Set<string>();
    const deduped = all.filter((entry) => {
      const key = `${entry.personId}:${entry.scope}:${entry.via}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const people = await this.db.person.findMany({
      where: { id: { in: [...new Set(deduped.map((e) => e.personId))] } },
      select: { id: true, fullName: true },
    });
    const nameOf = new Map(people.map((p) => [p.id, p.fullName]));
    return deduped.map((e) => ({ ...e, fullName: nameOf.get(e.personId) ?? '(unknown)' }));
  }

  private async domainRoleHolders(
    resource: string,
    action: Action,
  ): Promise<Array<Omit<WhoCanAccessEntry, 'fullName'>>> {
    const grantRows = await this.db.roleTemplateGrant.findMany({
      where: { resource, action, effect: 'allow' },
      select: { role: true },
    });
    const roles = [...new Set(grantRows.map((g) => g.role))];
    if (!roles.length) return [];

    const assignments = await this.db.roleAssignment.findMany({
      where: { role: { in: roles }, status: 'active' },
      select: { personId: true, role: true, orgUnitId: true },
    });
    return Promise.all(
      assignments.map(async (a) => ({
        personId: a.personId,
        scope: await this.accessRepository.pathOf(a.orgUnitId),
        via: `role:${a.role}`,
      })),
    );
  }

  private async platformRoleHolders(
    resource: string,
    action: Action,
  ): Promise<Array<Omit<WhoCanAccessEntry, 'fullName'>>> {
    const grantRows = await this.db.roleTemplateGrant.findMany({
      where: { resource, action, effect: 'allow', roleTemplate: { tier: 'platform' } },
      select: { role: true },
    });
    const roles = new Set(grantRows.map((g) => g.role));

    const catalog = await this.db.resourceCatalog.findUnique({ where: { resource } });
    if (catalog && catalog.sensitivity !== 'restricted') roles.add('system_admin');
    if (!roles.size) return [];

    const assignments = await this.db.platformRoleAssignment.findMany({
      where: { role: { in: [...roles] }, ...notExpired() },
      select: { personId: true, role: true, orgUnitId: true },
    });
    return Promise.all(
      assignments.map(async (a) => ({
        personId: a.personId,
        scope: a.orgUnitId
          ? await this.accessRepository.pathOf(a.orgUnitId)
          : await this.accessRepository.regionRootPath(),
        via: `platform:${a.role}`,
      })),
    );
  }

  private async unitPolicyHolders(
    resource: string,
    action: Action,
  ): Promise<Array<Omit<WhoCanAccessEntry, 'fullName'>>> {
    const rows = await this.db.unitPolicyGrant.findMany({
      where: { resource, action, effect: 'allow', ...notExpired() },
    });

    const out: Array<Omit<WhoCanAccessEntry, 'fullName'>> = [];
    for (const row of rows) {
      const scope = await this.accessRepository.pathOf(row.orgUnitId);
      if (row.subjectKind === 'person' && row.subjectPersonId) {
        out.push({ personId: row.subjectPersonId, scope, via: 'unit_policy' });
        continue;
      }
      if (row.subjectKind === 'role' && row.subjectRole) {
        const assignments = await this.db.roleAssignment.findMany({
          where: { role: row.subjectRole, orgUnitId: row.orgUnitId, status: 'active' },
          select: { personId: true },
        });
        for (const a of assignments) out.push({ personId: a.personId, scope, via: 'unit_policy' });
      }
    }
    return out;
  }

  private async directGrantHolders(
    resource: string,
    action: Action,
  ): Promise<Array<Omit<WhoCanAccessEntry, 'fullName'>>> {
    const rows = await this.db.personGrant.findMany({
      where: { resource, action, effect: 'allow', ...notExpired() },
    });
    return Promise.all(
      rows.map(async (r) => ({
        personId: r.personId,
        scope: await this.accessRepository.pathOf(r.orgUnitId),
        via: 'direct',
      })),
    );
  }
}
