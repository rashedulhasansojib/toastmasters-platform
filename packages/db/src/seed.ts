import type {
  PermissionAction,
  PermissionCondition,
  PrismaClient,
  ResourceSensitivity,
  RoleTemplateScopeRule,
  RoleTemplateTier,
} from './generated/prisma/client';

interface ResourceSeed {
  resource: string;
  context: string;
  label: string;
  allowedActions: PermissionAction[];
  clubScoped: boolean;
  sensitivity: ResourceSensitivity;
}

interface GrantSeed {
  resource: string;
  action: PermissionAction;
  condition?: PermissionCondition;
}

interface RoleTemplateSeed {
  role: string;
  tier: RoleTemplateTier;
  unitTypes: string[];
  scopeRule: RoleTemplateScopeRule;
  isSingleton: boolean;
  label: string;
  grants: GrantSeed[];
}

const RESOURCES: ResourceSeed[] = [
  {
    resource: 'identity.role_assignment',
    context: 'identity',
    label: 'Officer role assignment',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.meeting',
    context: 'meeting',
    label: 'Meeting',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.role',
    context: 'meeting',
    label: 'Meeting role assignment',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.agenda_item',
    context: 'meeting',
    label: 'Agenda item',
    allowedActions: ['read', 'create'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.speech_slot',
    context: 'meeting',
    label: 'Speech slot',
    allowedActions: ['read', 'create', 'approve'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.checklist',
    context: 'meeting',
    label: 'Meeting checklist',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.capability_token',
    context: 'meeting',
    label: 'Capability token',
    allowedActions: ['create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.live_record',
    context: 'meeting',
    label: 'Live meeting-day record (timer/ah-counter/grammarian)',
    allowedActions: ['read', 'create'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.ballot',
    context: 'meeting',
    label: 'Meeting award ballot',
    allowedActions: ['read', 'create', 'approve'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'meeting.vote',
    context: 'meeting',
    label: 'Meeting award vote',
    allowedActions: ['create'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'finance.ledger',
    context: 'finance',
    label: 'Club ledger',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'restricted',
  },
  {
    resource: 'education.evaluation',
    context: 'education',
    label: 'Speech evaluation',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'restricted',
  },
  {
    resource: 'membership.health_signal',
    context: 'membership',
    label: 'Member health signal',
    allowedActions: ['read'],
    clubScoped: true,
    sensitivity: 'restricted',
  },
  {
    resource: 'platform.audit',
    context: 'platform',
    label: 'Audit trail',
    allowedActions: ['read'],
    clubScoped: false,
    sensitivity: 'restricted',
  },
  {
    resource: 'identity.invitation',
    context: 'identity',
    label: 'Invitation',
    allowedActions: ['create'],
    clubScoped: false, // can target any org-unit tier, not just clubs
    sensitivity: 'normal',
  },
  {
    resource: 'org.unit',
    context: 'org',
    label: 'Organisation unit',
    allowedActions: ['create', 'update'],
    clubScoped: false, // spans every tier: region, district, division, area, club
    sensitivity: 'normal',
  },
  {
    resource: 'access.unit_policy',
    context: 'access',
    label: 'Unit policy override',
    allowedActions: ['create'],
    clubScoped: false,
    sensitivity: 'normal',
  },
  {
    // M4 Slice 1: system-design.md §11.1. PII but not `restricted` — the four
    // named restricted resources (finance.ledger, education.evaluation,
    // membership.health_signal, platform.audit) are a deliberately short
    // list; a prospect is already club-scoped and time-boxed by
    // `deleteAfter`, which is a materially different exposure than a
    // ledger amount or an evaluation.
    resource: 'membership.prospect',
    context: 'membership',
    label: 'Prospect',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M4 Slice 6: system-design.md §12.1. Restricted like finance.ledger — a
    // member's dues amounts/status are as sensitive as a ledger line.
    resource: 'finance.dues',
    context: 'finance',
    label: 'Member dues record',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'restricted',
  },
  {
    // M4 Slice 7: system-design.md §12.2. Restricted like finance.ledger/finance.dues.
    resource: 'finance.invoice',
    context: 'finance',
    label: 'Invoice',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'restricted',
  },
  {
    // M4 Slice 8: system-design.md §12.3 / CLAUDE.md §2 decision 8.
    resource: 'finance.installment_plan',
    context: 'finance',
    label: 'Installment plan',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'restricted',
  },
];

// Grants transcribed verbatim from system-design.md §7.5 for the resources
// seeded above. Not the full matrix — see the Slice 3 plan's scoping note.
const ROLE_TEMPLATES: RoleTemplateSeed[] = [
  {
    role: 'club_president',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Club President',
    grants: [
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'meeting.role', action: 'read' },
      { resource: 'meeting.agenda_item', action: 'read' },
      { resource: 'meeting.speech_slot', action: 'read' },
      { resource: 'meeting.checklist', action: 'read' },
      { resource: 'meeting.live_record', action: 'read' },
      { resource: 'meeting.ballot', action: 'read' },
      { resource: 'meeting.ballot', action: 'create' },
      { resource: 'meeting.ballot', action: 'approve' },
      { resource: 'meeting.vote', action: 'create' },
      { resource: 'finance.ledger', action: 'read' },
      { resource: 'identity.role_assignment', action: 'create' },
      { resource: 'identity.role_assignment', action: 'update' },
    ],
  },
  {
    role: 'club_vpe',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Vice President Education',
    grants: [
      { resource: 'meeting.meeting', action: 'create' },
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'meeting.meeting', action: 'update' },
      { resource: 'meeting.role', action: 'create' },
      { resource: 'meeting.role', action: 'read' },
      { resource: 'meeting.role', action: 'update' },
      { resource: 'meeting.agenda_item', action: 'create' },
      { resource: 'meeting.agenda_item', action: 'read' },
      { resource: 'meeting.speech_slot', action: 'read' },
      { resource: 'meeting.speech_slot', action: 'approve' },
      { resource: 'meeting.checklist', action: 'create' },
      { resource: 'meeting.checklist', action: 'read' },
      { resource: 'meeting.checklist', action: 'update' },
      { resource: 'meeting.capability_token', action: 'create' },
      { resource: 'meeting.capability_token', action: 'update' },
      { resource: 'meeting.live_record', action: 'create' },
      { resource: 'meeting.live_record', action: 'read' },
      { resource: 'meeting.ballot', action: 'read' },
      { resource: 'meeting.ballot', action: 'create' },
      { resource: 'meeting.ballot', action: 'approve' },
      { resource: 'meeting.vote', action: 'create' },
      { resource: 'identity.role_assignment', action: 'read' },
    ],
  },
  {
    role: 'club_treasurer',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Treasurer',
    grants: [
      { resource: 'finance.ledger', action: 'read' },
      { resource: 'finance.ledger', action: 'create' },
      { resource: 'finance.ledger', action: 'update' },
      { resource: 'finance.dues', action: 'read' },
      { resource: 'finance.dues', action: 'create' },
      { resource: 'finance.dues', action: 'update' },
      { resource: 'finance.invoice', action: 'read' },
      { resource: 'finance.invoice', action: 'create' },
      { resource: 'finance.invoice', action: 'update' },
      { resource: 'finance.installment_plan', action: 'read' },
      { resource: 'finance.installment_plan', action: 'create' },
      { resource: 'finance.installment_plan', action: 'update' },
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'identity.role_assignment', action: 'read' },
    ],
  },
  {
    // M4 Slice 1: the prospect pipeline's owner — system-design.md §11.1
    // ("Guests are club-local, non-authenticating, VPM-owned").
    role: 'club_vpm',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Vice President Membership',
    grants: [
      { resource: 'membership.prospect', action: 'read' },
      { resource: 'membership.prospect', action: 'create' },
      { resource: 'membership.prospect', action: 'update' },
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'identity.role_assignment', action: 'read' },
    ],
  },
  {
    role: 'club_member',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: false,
    label: 'Member',
    grants: [
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'meeting.role', action: 'read' },
      { resource: 'meeting.agenda_item', action: 'read' },
      { resource: 'meeting.speech_slot', action: 'read' },
      { resource: 'meeting.speech_slot', action: 'create' },
      { resource: 'meeting.checklist', action: 'read' },
      { resource: 'meeting.live_record', action: 'read' },
      { resource: 'meeting.live_record', action: 'create' },
      { resource: 'meeting.ballot', action: 'read' },
      { resource: 'meeting.vote', action: 'create' },
      { resource: 'identity.role_assignment', action: 'read' },
      { resource: 'finance.ledger', action: 'read', condition: 'own' },
      { resource: 'finance.dues', action: 'read', condition: 'own' },
      { resource: 'finance.invoice', action: 'read', condition: 'own' },
      { resource: 'finance.installment_plan', action: 'read', condition: 'own' },
    ],
  },
  // Platform roles: tier 'platform', not bound to a unit type. Zero grants —
  // see the Slice 3 plan's note on why these are deferred to Slices 4/6.
  {
    role: 'system_admin',
    tier: 'platform',
    unitTypes: [],
    scopeRule: 'self_subtree',
    isSingleton: false,
    label: 'System Administrator',
    grants: [],
  },
  {
    role: 'unit_admin',
    tier: 'platform',
    unitTypes: [],
    // system-design.md §7.7: "Scope: One subtree" — was 'self_unit' (M1
    // Slice 3 placeholder, unexercised until M2 Slice 1's invitation flow).
    scopeRule: 'self_subtree',
    isSingleton: false,
    label: 'Unit Administrator',
    grants: [
      { resource: 'identity.invitation', action: 'create' },
      { resource: 'identity.role_assignment', action: 'create' },
      { resource: 'org.unit', action: 'create' },
      { resource: 'org.unit', action: 'update' },
      { resource: 'access.unit_policy', action: 'create' },
    ],
  },
  {
    role: 'support_readonly',
    tier: 'platform',
    unitTypes: [],
    scopeRule: 'self_subtree',
    isSingleton: false,
    label: 'Support (read-only)',
    grants: [],
  },
];

export async function seedAccessVocabulary(db: PrismaClient): Promise<void> {
  for (const r of RESOURCES) {
    await db.resourceCatalog.upsert({
      where: { resource: r.resource },
      create: r,
      update: r,
    });
  }

  for (const t of ROLE_TEMPLATES) {
    await db.roleTemplate.upsert({
      where: { role: t.role },
      create: {
        role: t.role,
        tier: t.tier,
        unitTypes: t.unitTypes as never,
        scopeRule: t.scopeRule,
        isSingleton: t.isSingleton,
        isSystem: true,
        label: t.label,
      },
      update: {
        tier: t.tier,
        unitTypes: t.unitTypes as never,
        scopeRule: t.scopeRule,
        isSingleton: t.isSingleton,
        label: t.label,
      },
    });

    for (const g of t.grants) {
      const condition = g.condition ?? 'any';
      await db.roleTemplateGrant.upsert({
        where: {
          role_resource_action_condition: {
            role: t.role,
            resource: g.resource,
            action: g.action,
            condition,
          },
        },
        create: {
          role: t.role,
          resource: g.resource,
          action: g.action,
          condition,
          effect: 'allow',
        },
        update: { effect: 'allow' },
      });
    }
  }
}

interface PathwayProjectSeed {
  projectCode: string;
  name: string;
  level: number;
  minMinutes: number;
  maxMinutes: number;
}

interface PathwayPathSeed {
  pathCode: string;
  name: string;
  credential: string;
  projects: PathwayProjectSeed[];
}

/**
 * M3 Slice 4: system-design.md §10.1's PathCatalog, trimmed (see the schema
 * comment on `PathwayPath`) to what speech-slot validation needs. TI's full
 * path list is much longer — extend this seed as more paths are needed, no
 * migration required.
 */
const PATHWAY_PATHS: PathwayPathSeed[] = [
  {
    pathCode: 'PM',
    name: 'Presentation Mastery',
    credential: 'Presentation Mastery',
    projects: [
      {
        projectCode: 'PM-ICE-BREAKER',
        name: 'Ice Breaker',
        level: 1,
        minMinutes: 4,
        maxMinutes: 6,
      },
      {
        projectCode: 'PM-EVAL-FEEDBACK',
        name: 'Evaluation and Feedback',
        level: 1,
        minMinutes: 2,
        maxMinutes: 3,
      },
    ],
  },
];

export async function seedPathwayCatalog(db: PrismaClient): Promise<void> {
  for (const path of PATHWAY_PATHS) {
    await db.pathwayPath.upsert({
      where: { pathCode: path.pathCode },
      create: { pathCode: path.pathCode, name: path.name, credential: path.credential },
      update: { name: path.name, credential: path.credential },
    });

    for (const project of path.projects) {
      await db.pathwayProject.upsert({
        where: {
          pathCode_projectCode: { pathCode: path.pathCode, projectCode: project.projectCode },
        },
        create: { pathCode: path.pathCode, ...project },
        update: project,
      });
    }
  }
}
