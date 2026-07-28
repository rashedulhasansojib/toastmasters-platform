import { describe, it, expect } from 'vitest';
import { explain, renderExplain } from './explain';
import type { AccessRequest, Grant } from './authz.types';

const request: AccessRequest = {
  principal: { userId: 'karim', roles: [], scopes: [] },
  resource: 'finance.ledger',
  action: 'read',
  scope: 'd41.divA.a1.c1234',
};

describe('explain', () => {
  it('names the matching grant and marks its line', () => {
    const grants: Grant[] = [
      {
        role: 'club_treasurer',
        scope: 'd41.divA.a1.c1234',
        resource: 'finance.ledger',
        action: 'read',
        condition: 'any',
        effect: 'allow',
        source: { kind: 'domain_role', role: 'club_treasurer', orgUnitId: 'club-1234' },
      },
    ];
    const result = explain(grants, request);
    expect(result.decision.allowed).toBe(true);
    expect(result.matchedGrant?.role).toBe('club_treasurer');
    const line = result.lines.find((l) => l.matched);
    expect(line?.detail).toContain('ALLOW');
    expect(line?.detail).toContain('← matched');
    expect(result.scopeCheck?.passed).toBe(true);
    expect(result.conditionCheck?.passed).toBe(true);
  });

  it('shows "none" for a source with zero grants, and default-denies with no matched grant', () => {
    const result = explain([], request);
    expect(result.decision.allowed).toBe(false);
    expect(result.decision.reason).toBe('default-deny');
    expect(result.matchedGrant).toBeNull();
    expect(result.lines.find((l) => l.label === 'platform roles')?.detail).toBe('none');
    expect(result.lines.find((l) => l.label === 'direct grants')?.detail).toBe('none');
  });

  it('a role with grants for other resources shows "no grant for X:Y", not "none"', () => {
    const grants: Grant[] = [
      {
        role: 'club_member',
        scope: 'd41.divA.a1.c1234',
        resource: 'meeting.meeting',
        action: 'read',
        condition: 'any',
        effect: 'allow',
        source: { kind: 'domain_role', role: 'club_member', orgUnitId: 'club-1234' },
      },
    ];
    const result = explain(grants, request);
    const line = result.lines.find((l) => l.label.startsWith('role:club_member'));
    expect(line?.detail).toBe('no grant for finance.ledger:read');
  });

  it("deny beats allow — matches rbac-design.md §12 and Slice 6's unit-policy scenario", () => {
    const grants: Grant[] = [
      {
        role: 'club_member',
        scope: 'd41.divA.a1.c1234',
        resource: 'finance.ledger',
        action: 'read',
        condition: 'any',
        effect: 'allow',
        source: { kind: 'domain_role', role: 'club_member', orgUnitId: 'club-1234' },
      },
      {
        role: 'policy:club-1234',
        scope: 'd41.divA.a1.c1234',
        exactOnly: true,
        resource: 'finance.ledger',
        action: 'read',
        condition: 'any',
        effect: 'deny',
        source: { kind: 'unit_policy', orgUnitId: 'club-1234' },
      },
    ];
    const result = explain(grants, request);
    expect(result.decision.allowed).toBe(false);
    expect(result.decision.reason).toBe('explicit-deny');
    expect(result.matchedGrant?.effect).toBe('deny');
  });
});

describe('renderExplain', () => {
  it('renders the §7.3 shape for an allowed decision', () => {
    const grants: Grant[] = [
      {
        role: 'club_treasurer',
        scope: 'd41.divA.a1.c1234',
        resource: 'finance.ledger',
        action: 'read',
        condition: 'any',
        effect: 'allow',
        source: { kind: 'domain_role', role: 'club_treasurer', orgUnitId: 'club-1234' },
      },
    ];
    const result = explain(grants, request);
    const text = renderExplain('Karim Hossain', request, result);
    expect(text).toContain('Karim Hossain · finance.ledger · read · d41.divA.a1.c1234');
    expect(text).toContain('✓ ALLOW');
    expect(text).toContain('role:club_treasurer @ d41.divA.a1.c1234');
    expect(text).toContain('← matched');
    expect(text).toContain('Scope check:');
    expect(text).toContain('Condition:');
  });

  it('renders a default-deny with no scope/condition checklist', () => {
    const text = renderExplain('Nusrat', request, explain([], request));
    expect(text).toContain('✗ DENY');
    expect(text).not.toContain('Scope check:');
  });
});
