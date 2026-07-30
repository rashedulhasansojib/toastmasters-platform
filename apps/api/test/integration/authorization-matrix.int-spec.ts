import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { seedAccessVocabulary } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';
import { ProgramYearRepository } from '../../src/modules/identity/program-year.repository';
import { PersonRepository } from '../../src/modules/identity/person.repository';
import { RoleAssignmentRepository } from '../../src/modules/identity/role-assignment.repository';
import { GrantAdminRepository } from '../../src/modules/access/grant-admin.repository';
import { AccessRepository } from '../../src/modules/access/access.repository';
import { AuthzService } from '../../src/common/authz/authz.service';
import type { Action } from '../../src/common/authz/authz.types';

/**
 * rbac-design.md §9 / CLAUDE.md §7: "The authorisation matrix — every
 * (role × resource × action × scope), generated from role templates and
 * asserted against authorize(). The single most valuable suite in the
 * project." Generated from the seeded role_template/resource_catalog data
 * itself (Slice 10) rather than a hand-maintained expectation table, so a
 * new grant added to the seed is covered automatically.
 */
describe('Authorisation matrix (generated from role_template × resource_catalog)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let authz: AuthzService;
  let clubAPath: string;
  let clubBPath: string;
  const actorId: Record<string, string> = {};

  const ROLES = [
    'club_president',
    'club_vpe',
    'club_treasurer',
    'club_member',
    'club_vpm',
    'club_vppr',
    'club_saa',
    'club_secretary',
    'system_admin',
    'unit_admin',
    'support_readonly',
  ];
  // Global roles (system_admin, support_readonly) are granted at the region
  // root — they have no "sibling club" by construction, so sibling isolation
  // is only meaningful for these scope-narrow roles.
  const CLUB_SCOPED_ROLES = [
    'club_president',
    'club_vpe',
    'club_treasurer',
    'club_member',
    'club_vpm',
    'club_vppr',
    'club_saa',
    'club_secretary',
    'unit_admin',
  ];

  const RESOURCE_ACTIONS: Array<{ resource: string; actions: Action[] }> = [
    { resource: 'identity.role_assignment', actions: ['read', 'create', 'update'] },
    { resource: 'meeting.meeting', actions: ['read', 'create', 'update'] },
    { resource: 'meeting.role', actions: ['read', 'create', 'update'] },
    { resource: 'meeting.planner', actions: ['read', 'create'] },
    { resource: 'meeting.agenda_item', actions: ['read', 'create'] },
    { resource: 'meeting.speech_slot', actions: ['read', 'create', 'approve'] },
    { resource: 'meeting.checklist', actions: ['read', 'create', 'update'] },
    { resource: 'meeting.capability_token', actions: ['create', 'update'] },
    { resource: 'meeting.live_record', actions: ['read', 'create'] },
    { resource: 'meeting.ballot', actions: ['read', 'create', 'approve'] },
    { resource: 'meeting.vote', actions: ['create'] },
    { resource: 'finance.ledger', actions: ['read', 'create', 'update'] },
    { resource: 'education.evaluation', actions: ['read', 'create', 'update'] },
    { resource: 'membership.health_signal', actions: ['read'] },
    { resource: 'platform.audit', actions: ['read'] },
    { resource: 'identity.invitation', actions: ['create', 'read', 'update'] },
    // Users admin: system_admin via broad synthesis, unit_admin/support_readonly
    // via explicit seeded grants — no club/area/division role template holds it.
    { resource: 'identity.person', actions: ['read', 'create', 'update'] },
    { resource: 'org.unit', actions: ['create', 'update'] },
    { resource: 'access.unit_policy', actions: ['create'] },
    { resource: 'membership.guest', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'finance.dues', actions: ['read', 'create', 'update'] },
    { resource: 'finance.invoice', actions: ['read', 'create', 'update'] },
    { resource: 'finance.installment_plan', actions: ['read', 'create', 'update'] },
    { resource: 'finance.report', actions: ['read', 'create', 'update'] },
    { resource: 'library.governance_document', actions: ['read', 'create', 'update'] },
    { resource: 'library.item', actions: ['read', 'create', 'update'] },
    { resource: 'library.content_plan', actions: ['read', 'create', 'update'] },
    { resource: 'operations.inventory', actions: ['read', 'create', 'update'] },
    { resource: 'quality.area_visit_report', actions: ['read', 'create', 'update'] },
    { resource: 'quality.president_contact_log', actions: ['read', 'create'] },
    { resource: 'quality.dcp_projection', actions: ['read'] },
    { resource: 'quality.health_snapshot', actions: ['read'] },
    { resource: 'quality.ticket', actions: ['read', 'create', 'update'] },
    { resource: 'governance.club_success_plan', actions: ['read', 'create', 'update'] },
    { resource: 'education.record', actions: ['read', 'create', 'update', 'approve'] },
    { resource: 'education.progress', actions: ['read'] },
    { resource: 'education.approval', actions: ['read', 'update', 'approve'] },
    { resource: 'education.mentorship', actions: ['read', 'create', 'update'] },
    { resource: 'education.onboarding', actions: ['read', 'create', 'update'] },
    { resource: 'governance.excom_meeting', actions: ['read', 'create', 'update'] },
    { resource: 'governance.motion', actions: ['read', 'create', 'update'] },
    { resource: 'governance.minutes', actions: ['read', 'create', 'update', 'approve'] },
  ];
  // area_director/division_director (tier area/division, scopeRule
  // self_subtree) aren't exercised here — this fixture only builds a
  // region/district/club tree; adding area-tier coverage means a new area
  // org unit, not a one-line addition to this array. Their grants are
  // still real seeded data (M6 Slice 6), just not asserted by this
  // generated matrix yet.

  /**
   * system_admin is derived specially, matching access.repository.ts's real
   * synthesis (allow on every non-restricted resource, deny on the four
   * restricted ones) — not from role_template_grant rows, which Slice 3 left
   * empty for it. Every other role reads its seeded grants directly.
   */
  async function expectedAllow(role: string, resource: string, action: Action): Promise<boolean> {
    if (role === 'system_admin') {
      const catalog = await db.resourceCatalog.findUnique({ where: { resource } });
      return catalog?.sensitivity !== 'restricted';
    }
    const grant = await db.roleTemplateGrant.findFirst({
      where: { role, resource, action, effect: 'allow' },
    });
    return grant != null;
  }

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    await seedAccessVocabulary(db);

    const orgUnits = new OrgUnitRepository(db);
    const programYears = new ProgramYearRepository(db);
    const people = new PersonRepository(db);
    const roleAssignments = new RoleAssignmentRepository(db);
    const access = new AccessRepository(db);
    const grantAdmin = new GrantAdminRepository(db, access);
    authz = new AuthzService(access);

    const region = await orgUnits.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await orgUnits.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const clubA = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'cA',
      name: 'Club A',
      timezone: 'Asia/Dhaka',
    });
    const clubB = await orgUnits.createChild({
      parentId: district.id,
      type: 'club',
      code: 'cB',
      name: 'Club B',
      timezone: 'Asia/Dhaka',
    });
    clubAPath = clubA.path;
    clubBPath = clubB.path;

    const year = await programYears.create({
      id: '2026-2027',
      startsOn: new Date('2026-07-01'),
      endsOn: new Date('2027-06-30'),
    });

    const domainRoles = [
      'club_president',
      'club_vpe',
      'club_treasurer',
      'club_member',
      'club_vpm',
      'club_vppr',
      'club_saa',
      'club_secretary',
    ];
    for (const role of domainRoles) {
      const person = await people.create({ email: `${role}@example.com`, fullName: role });
      actorId[role] = person.id;
      await roleAssignments.assign({
        personId: person.id,
        orgUnitId: clubA.id,
        role,
        programYearId: year.id,
        termStart: new Date('2026-07-01'),
        termEnd: new Date('2027-06-30'),
        appointedBy: person.id,
      });
    }

    const unitAdmin = await people.create({
      email: 'unit_admin@example.com',
      fullName: 'unit_admin',
    });
    actorId['unit_admin'] = unitAdmin.id;
    await grantAdmin.grantPlatformRole({
      personId: unitAdmin.id,
      role: 'unit_admin',
      orgUnitId: clubA.id,
      grantedBy: unitAdmin.id,
    });

    for (const role of ['system_admin', 'support_readonly']) {
      const person = await people.create({ email: `${role}@example.com`, fullName: role });
      actorId[role] = person.id;
      await grantAdmin.grantPlatformRole({
        personId: person.id,
        role,
        orgUnitId: null,
        grantedBy: person.id,
      });
    }
  });
  afterAll(async () => {
    await stop();
  });

  const context = { isOwner: true, isAssigned: true, isParty: true, isPublished: true };

  for (const role of ROLES) {
    for (const { resource, actions } of RESOURCE_ACTIONS) {
      for (const action of actions) {
        it(`${role} · ${resource}:${action}`, async () => {
          const expected = await expectedAllow(role, resource, action);
          const decision = await authz.authorize({
            principal: { userId: actorId[role]!, roles: [], scopes: [] },
            resource,
            action,
            scope: clubAPath,
            context,
          });
          expect(decision.allowed).toBe(expected);
        });
      }
    }
  }

  for (const role of CLUB_SCOPED_ROLES) {
    for (const { resource, actions } of RESOURCE_ACTIONS) {
      for (const action of actions) {
        it(`${role} · ${resource}:${action} · sibling club denied`, async () => {
          const decision = await authz.authorize({
            principal: { userId: actorId[role]!, roles: [], scopes: [] },
            resource,
            action,
            scope: clubBPath,
            context,
          });
          expect(decision.allowed).toBe(false);
        });
      }
    }
  }
});
