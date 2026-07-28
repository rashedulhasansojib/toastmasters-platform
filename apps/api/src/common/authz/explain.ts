import type { AccessDecision, AccessRequest, Grant } from './authz.types';
import { evaluate, grantApplies } from './evaluate';

export interface ExplainLine {
  label: string;
  detail: string;
  matched: boolean;
}

export interface ExplainResult {
  decision: AccessDecision;
  matchedGrant: Grant | null;
  lines: ExplainLine[];
  scopeCheck: { grantScope: string; targetScope: string; passed: boolean } | null;
  conditionCheck: { condition: string; passed: boolean } | null;
}

interface Group {
  label: string;
  grants: Grant[];
}

/** Groups resolved grants by source the way rbac-design.md §7.3's trace does. */
function groupBySource(grants: readonly Grant[]): Group[] {
  const platform: Grant[] = [];
  const direct: Grant[] = [];
  const domainRoles = new Map<string, Group>();
  const unitPolicies = new Map<string, Group>();

  for (const grant of grants) {
    switch (grant.source?.kind) {
      case 'platform':
        platform.push(grant);
        break;
      case 'direct':
        direct.push(grant);
        break;
      case 'domain_role': {
        const key = `${grant.source.role}@${grant.source.orgUnitId}`;
        const group = domainRoles.get(key) ?? {
          label: `role:${grant.source.role} @ ${grant.scope}`,
          grants: [],
        };
        group.grants.push(grant);
        domainRoles.set(key, group);
        break;
      }
      case 'unit_policy': {
        const key = grant.source.orgUnitId;
        const group = unitPolicies.get(key) ?? { label: `unit policy ${grant.scope}`, grants: [] };
        group.grants.push(grant);
        unitPolicies.set(key, group);
        break;
      }
      default:
        // Untagged grant (e.g. a hand-built fixture with no `source`) — still
        // evaluated for the decision, just not attributable to a trace group.
        break;
    }
  }

  return [
    { label: 'platform roles', grants: platform },
    ...domainRoles.values(),
    ...unitPolicies.values(),
    { label: 'direct grants', grants: direct },
  ];
}

/**
 * The forward access-inspector trace (rbac-design.md §7.3): which grants were
 * considered, which one decided the outcome, and why. Never used for the
 * actual authorization decision — AuthzService.authorize() owns that via
 * evaluate() directly. This is a read-only explanation of the same result.
 */
export function explain(grants: readonly Grant[], request: AccessRequest): ExplainResult {
  const decision = evaluate(grants, request);
  const applicable = grants.filter((g) => grantApplies(g, request));
  const winner =
    applicable.find((g) => g.effect === 'deny') ??
    applicable.find((g) => g.effect === 'allow') ??
    null;

  const lines: ExplainLine[] = groupBySource(grants).map((group) => {
    const matching = group.grants.filter((g) => grantApplies(g, request));
    if (matching.length === 0) {
      return {
        label: group.label,
        detail:
          group.grants.length === 0 ? 'none' : `no grant for ${request.resource}:${request.action}`,
        matched: false,
      };
    }
    const picked = matching.find((g) => g === winner) ?? matching[0]!;
    const isWinner = picked === winner;
    return {
      label: group.label,
      detail: `${picked.effect.toUpperCase()}  ${request.resource}:${request.action} (${picked.condition})${isWinner ? '  ← matched' : ''}`,
      matched: isWinner,
    };
  });

  return {
    decision,
    matchedGrant: winner,
    lines,
    scopeCheck: winner
      ? { grantScope: winner.scope, targetScope: request.scope, passed: true }
      : null,
    conditionCheck: winner ? { condition: winner.condition, passed: true } : null,
  };
}

/** Renders an ExplainResult as the ASCII block from rbac-design.md §7.3. */
export function renderExplain(
  personLabel: string,
  request: AccessRequest,
  result: ExplainResult,
): string {
  const header = `${personLabel} · ${request.resource} · ${request.action} · ${request.scope}`;
  const rule = '─'.repeat(header.length);
  const verdict = result.decision.allowed
    ? `✓ ALLOW  —  ${result.matchedGrant ? `${result.matchedGrant.role} @ ${result.matchedGrant.scope}` : ''}`
    : `✗ DENY  —  ${result.decision.reason}`;
  const traceLines = result.lines.map((l) => `  ${l.label.padEnd(32)}  ${l.detail}`);
  const parts = [header, rule, verdict, '', 'Evaluation trace:', ...traceLines];

  if (result.scopeCheck) {
    parts.push(
      '',
      `Scope check:  ${result.scopeCheck.grantScope}  within  ${result.scopeCheck.targetScope}   ✓`,
    );
  }
  if (result.conditionCheck) {
    parts.push(`Condition:    ${result.conditionCheck.condition}                            ✓`);
  }
  return parts.join('\n');
}
