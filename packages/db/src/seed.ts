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
    // M9: the club's own member roster — name + person id only, so the
    // meeting page can offer a member picker instead of asking an officer
    // to paste a UUID. Club-scoped and granted to club roles only; the
    // oversight tiers (area/division/district) never receive it, because
    // they see counts and projections, never member detail (FR-OVS-3).
    resource: 'identity.club_member',
    context: 'identity',
    label: 'Club member roster',
    allowedActions: ['read'],
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
    // FR-MTG-5: the multi-week planner is a projection over meeting.role, but
    // it gets its own resource so a club can hand out season planning without
    // also handing out day-of role edits — and vice versa.
    resource: 'meeting.planner',
    context: 'meeting',
    label: 'Meeting planner',
    allowedActions: ['read', 'create'],
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
    // M9 Slice 2: per-meeting guest roster. Not `restricted` — same PII
    // exposure class as `membership.guest` (already club-scoped, no
    // financial/evaluation-grade data).
    resource: 'meeting.guest',
    context: 'meeting',
    label: 'Meeting guest',
    allowedActions: ['read', 'create', 'update', 'delete'],
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
    // M9 Slice 3: member headcount for one meeting. Append-only — a
    // correction is a new `create`, never an `update`/`delete`, so those
    // actions are deliberately absent from the catalogue as well as
    // REVOKEd at the DB.
    resource: 'meeting.attendance',
    context: 'meeting',
    label: 'Meeting attendance record',
    allowedActions: ['read', 'create'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M9 Slice 4: free-form per-meeting notes/links. Distinct from
    // `library.item` (the versioned, reviewed document store) — nothing
    // here is a stored file, so it is not `restricted`.
    resource: 'meeting.resource',
    context: 'meeting',
    label: 'Meeting resource note',
    allowedActions: ['read', 'create', 'update', 'delete'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M9 Slice 5: reusable meeting template (roles + agenda + word of the
    // day + table topics). Wider than `meeting.agenda_item`'s template,
    // which covers agenda line items only.
    resource: 'meeting.template',
    context: 'meeting',
    label: 'Meeting template',
    allowedActions: ['read', 'create', 'update', 'delete'],
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
    // The platform-tier admin console. `normal`, not `restricted` — it reads
    // the org tree and headcounts, never the four restricted resources, which
    // stay behind break-glass even for system_admin (CLAUDE.md §5). No role
    // template grants it, so the only holder is system_admin, via the broad
    // non-restricted synthesis in access.repository.ts. That is what makes the
    // console super-admin-only without an `isAdmin` flag anywhere.
    resource: 'platform.console',
    context: 'platform',
    label: 'Platform admin console',
    allowedActions: ['read'],
    clubScoped: false,
    sensitivity: 'normal',
  },
  {
    // Users admin: list-pending / resend / revoke need read+update on top of
    // the original create-only shape.
    resource: 'identity.invitation',
    context: 'identity',
    label: 'Invitation',
    allowedActions: ['create', 'read', 'update'],
    clubScoped: false, // can target any org-unit tier, not just clubs
    sensitivity: 'normal',
  },
  {
    // Users admin (super-admin People search/create/edit/delete). Not
    // `restricted` — profile fields (name/email/phone/TI#/status) are the
    // same exposure class as `membership.guest`, not a ledger amount or an
    // evaluation. `delete` is reachable only by system_admin: no role
    // template's grant list includes it, so it arrives solely through the
    // broad non-restricted synthesis (same shape as `org.unit:delete`).
    // Soft-delete is one-way — the repository sets `person.deleted_at` and
    // ends active role assignments in the same transaction; the row is kept
    // for FK integrity on ledger/audit/history rows.
    resource: 'identity.person',
    context: 'identity',
    label: 'Person',
    allowedActions: ['read', 'create', 'update', 'delete'],
    clubScoped: false,
    sensitivity: 'normal',
  },
  {
    resource: 'org.unit',
    context: 'org',
    label: 'Organisation unit',
    // `delete` is reachable only by system_admin: unit_admin's role template
    // lists create/update explicitly and nothing grants delete, so it arrives
    // solely through system_admin's broad non-restricted synthesis. The
    // service still refuses any unit that is not empty (CLAUDE.md §2
    // decision: hard delete, only when empty).
    allowedActions: ['create', 'update', 'delete'],
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
    // list; a guest is already club-scoped and time-boxed by
    // `deleteAfter`, which is a materially different exposure than a
    // ledger amount or an evaluation.
    resource: 'membership.guest',
    context: 'membership',
    label: 'Guest',
    allowedActions: ['read', 'create', 'update', 'delete'],
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
  {
    // M4 Slice 9: system-design.md §12.4. `update` here means "finalize" —
    // a report's figures are never edited after generation (§19.3 I-19).
    resource: 'finance.report',
    context: 'finance',
    label: 'Financial report',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'restricted',
  },
  {
    // M5 Slice 2/5: system-design.md §15.1/§7.5. Split from `library.item`
    // because the matrix gives governance docs and media/links different
    // grants — see the M5 plan doc's "two library resources" note. Not
    // `restricted`: versioned and access-limited, but not in the same
    // exposure class as a ledger amount or an evaluation.
    resource: 'library.governance_document',
    context: 'library',
    label: 'Governance document',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M5 Slice 2/5: everything in the library that isn't a governance
    // document — media, links, notes, training/branding/meeting/finance/
    // other categories.
    resource: 'library.item',
    context: 'library',
    label: 'Library item',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M5 Slice 4/5: system-design.md §15.4. Plans and records only (N5).
    resource: 'library.content_plan',
    context: 'library',
    label: 'Content plan item',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M5 Slice 3/5: system-design.md §14.2. `quantity` is derived, not
    // stored — this resource gates both `InventoryItem` and its movements.
    resource: 'operations.inventory',
    context: 'operations',
    label: 'Inventory item',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M6 Slice 1/6: system-design.md §16.2. Club-scoped — the filing Area
    // Director's grant, anchored at their area, authorizes via org-tree
    // prefix inheritance (see the M6 plan doc).
    resource: 'quality.area_visit_report',
    context: 'quality',
    label: 'Area visit report',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    resource: 'quality.president_contact_log',
    context: 'quality',
    label: 'President contact log',
    allowedActions: ['read', 'create'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M6 Slice 3/6: read-only — the nightly worker job is the only writer.
    resource: 'quality.dcp_projection',
    context: 'quality',
    label: 'DCP projection',
    allowedActions: ['read'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M6 Slice 4/6: club-level aggregate only, never member detail
    // (FR-OVS-3). Read-only — the monthly worker job is the only writer.
    resource: 'quality.health_snapshot',
    context: 'quality',
    label: 'Club health snapshot',
    allowedActions: ['read'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M6 Slice 5/6: system-design.md §16.1. `scopeUnitId` may be any
    // org-tree unit, not only a club.
    resource: 'quality.ticket',
    context: 'quality',
    label: 'Ticket',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: false,
    sensitivity: 'normal',
  },
  {
    // M6 Slice 2/6: system-design.md §13.4. DCP qualifying requirement.
    resource: 'governance.club_success_plan',
    context: 'governance',
    label: 'Club Success Plan',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M7 Slice 1/6: system-design.md §10.1. `approve` is the VPE-only
    // level-confirmation action — the only write that ever feeds DCP.
    resource: 'education.record',
    context: 'education',
    label: 'Education record',
    allowedActions: ['read', 'create', 'update', 'approve'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M10: the club-wide education roster. Deliberately *not* `education.record`
    // read — a plain member holds that with condition `own`, and this endpoint
    // returns every member's row, so reusing it would hand the whole club's
    // progress to anyone with a self-scoped grant (FR-AUTHZ-8). Its own
    // resource keeps the grant unconditional and club-officer-only; the
    // oversight tiers never hold it (FR-OVS-3).
    resource: 'education.progress',
    context: 'education',
    label: 'Club education roster',
    allowedActions: ['read'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M11 Slice 1: VPE education-credit approval for a delivered speech.
    // `approve` is the VPE-only "yes, this counts" action; `update` covers
    // deny (state change `requested` → `denied`) so the six-action set
    // (rbac-design.md §5) stays closed — no bespoke `deny` verb.
    resource: 'education.approval',
    context: 'education',
    label: 'Speech education-credit approval',
    allowedActions: ['read', 'update', 'approve'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M7 Slice 3/6: system-design.md §10.3.
    resource: 'education.mentorship',
    context: 'education',
    label: 'Mentorship pairing',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M7 Slice 4/6: system-design.md §10.4. Must exist before the first
    // July (FR-EDU-7).
    resource: 'education.onboarding',
    context: 'education',
    label: 'Onboarding track/progress',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M8 Slice 1/6: system-design.md §13.1, FR-GOV-1.
    resource: 'governance.excom_meeting',
    context: 'governance',
    label: 'ExCom meeting',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M8 Slice 2/6: system-design.md §13.2, FR-GOV-2. Attributable votes —
    // not restricted the way anonymous award ballots' underlying Vote rows
    // are, since accountability is the whole point here.
    resource: 'governance.motion',
    context: 'governance',
    label: 'Motion',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M8 Slice 3/6: system-design.md §13.3, FR-GOV-3/4/5. `approve` is the
    // "approved at the next meeting" action — the only write that ever
    // makes a minutes row immutable.
    resource: 'governance.minutes',
    context: 'governance',
    label: 'Minutes',
    allowedActions: ['read', 'create', 'update', 'approve'],
    clubScoped: true,
    sensitivity: 'normal',
  },
  {
    // M8 Slice 5/6: system-design.md §17, FR-SUP-1. Self-service, no
    // club-scoped grants needed — the controller has no @ResourceScope,
    // same self-referential shape as tickets/mine.
    resource: 'support.profile',
    context: 'support',
    label: 'Cross-club support profile',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: false,
    sensitivity: 'normal',
  },
  {
    resource: 'support.request',
    context: 'support',
    label: 'Cross-club support request',
    allowedActions: ['read', 'create', 'update'],
    clubScoped: true,
    sensitivity: 'normal',
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
      { resource: 'meeting.planner', action: 'read' },
      { resource: 'meeting.agenda_item', action: 'read' },
      { resource: 'meeting.speech_slot', action: 'read' },
      { resource: 'meeting.checklist', action: 'read' },
      { resource: 'meeting.live_record', action: 'read' },
      { resource: 'meeting.ballot', action: 'read' },
      { resource: 'meeting.ballot', action: 'create' },
      { resource: 'meeting.ballot', action: 'approve' },
      { resource: 'meeting.vote', action: 'create' },
      { resource: 'meeting.guest', action: 'read' },
      { resource: 'meeting.attendance', action: 'read' },
      { resource: 'meeting.resource', action: 'read' },
      { resource: 'meeting.template', action: 'read' },
      { resource: 'finance.ledger', action: 'read' },
      { resource: 'finance.report', action: 'read' },
      { resource: 'finance.report', action: 'update' },
      { resource: 'identity.role_assignment', action: 'create' },
      { resource: 'identity.role_assignment', action: 'update' },
      { resource: 'library.governance_document', action: 'read' },
      { resource: 'library.governance_document', action: 'create' },
      { resource: 'library.governance_document', action: 'update' },
      { resource: 'library.item', action: 'read' },
      { resource: 'library.content_plan', action: 'read' },
      { resource: 'operations.inventory', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'create' },
      { resource: 'governance.club_success_plan', action: 'update' },
      { resource: 'quality.area_visit_report', action: 'read' },
      { resource: 'quality.president_contact_log', action: 'read' },
      { resource: 'quality.dcp_projection', action: 'read' },
      { resource: 'quality.health_snapshot', action: 'read' },
      { resource: 'quality.ticket', action: 'read' },
      { resource: 'quality.ticket', action: 'create' },
      { resource: 'quality.ticket', action: 'update' },
      { resource: 'education.record', action: 'read' },
      { resource: 'education.progress', action: 'read' },
      { resource: 'education.evaluation', action: 'read' },
      { resource: 'education.mentorship', action: 'read' },
      { resource: 'education.onboarding', action: 'read' },
      { resource: 'governance.excom_meeting', action: 'read' },
      { resource: 'governance.excom_meeting', action: 'create' },
      { resource: 'governance.excom_meeting', action: 'update' },
      { resource: 'governance.motion', action: 'read' },
      { resource: 'governance.motion', action: 'create' },
      { resource: 'governance.motion', action: 'update' },
      { resource: 'governance.minutes', action: 'read' },
      { resource: 'governance.minutes', action: 'approve' },
      { resource: 'support.request', action: 'read' },
      { resource: 'support.request', action: 'create' },
      { resource: 'identity.club_member', action: 'read' },
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
      // Planning the season ahead is the VPE's job (system-design.md §24).
      { resource: 'meeting.planner', action: 'read' },
      { resource: 'meeting.planner', action: 'create' },
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
      { resource: 'meeting.guest', action: 'read' },
      { resource: 'meeting.guest', action: 'create' },
      { resource: 'meeting.guest', action: 'update' },
      { resource: 'meeting.guest', action: 'delete' },
      // M9: the VPE owns the meeting page end to end.
      { resource: 'meeting.attendance', action: 'read' },
      { resource: 'meeting.attendance', action: 'create' },
      { resource: 'meeting.resource', action: 'read' },
      { resource: 'meeting.resource', action: 'create' },
      { resource: 'meeting.resource', action: 'update' },
      { resource: 'meeting.resource', action: 'delete' },
      { resource: 'meeting.template', action: 'read' },
      { resource: 'meeting.template', action: 'create' },
      { resource: 'meeting.template', action: 'update' },
      { resource: 'meeting.template', action: 'delete' },
      { resource: 'identity.role_assignment', action: 'read' },
      { resource: 'library.governance_document', action: 'read' },
      { resource: 'library.item', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'create' },
      { resource: 'governance.club_success_plan', action: 'update' },
      { resource: 'education.record', action: 'read' },
      { resource: 'education.record', action: 'create' },
      { resource: 'education.record', action: 'update' },
      { resource: 'education.record', action: 'approve' },
      { resource: 'education.progress', action: 'read' },
      { resource: 'education.approval', action: 'read' },
      { resource: 'education.approval', action: 'update' },
      { resource: 'education.approval', action: 'approve' },
      { resource: 'education.evaluation', action: 'read' },
      { resource: 'education.evaluation', action: 'create' },
      { resource: 'education.evaluation', action: 'update' },
      { resource: 'education.mentorship', action: 'read' },
      { resource: 'education.mentorship', action: 'create' },
      { resource: 'education.mentorship', action: 'update' },
      { resource: 'education.onboarding', action: 'read' },
      { resource: 'education.onboarding', action: 'create' },
      { resource: 'education.onboarding', action: 'update' },
      { resource: 'governance.excom_meeting', action: 'read' },
      { resource: 'governance.motion', action: 'read' },
      { resource: 'governance.minutes', action: 'read' },
      { resource: 'support.request', action: 'read' },
      { resource: 'support.request', action: 'create' },
      { resource: 'identity.club_member', action: 'read' },
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
      { resource: 'finance.report', action: 'read' },
      { resource: 'finance.report', action: 'create' },
      { resource: 'finance.report', action: 'update' },
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'identity.role_assignment', action: 'read' },
      { resource: 'library.governance_document', action: 'read' },
      { resource: 'operations.inventory', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'identity.club_member', action: 'read' },
    ],
  },
  {
    // M4 Slice 1: the guest pipeline's owner — system-design.md §11.1
    // ("Guests are club-local, non-authenticating, VPM-owned").
    role: 'club_vpm',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Vice President Membership',
    grants: [
      { resource: 'membership.guest', action: 'read' },
      { resource: 'membership.guest', action: 'create' },
      { resource: 'membership.guest', action: 'update' },
      { resource: 'membership.guest', action: 'delete' },
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'meeting.guest', action: 'read' },
      { resource: 'meeting.guest', action: 'create' },
      { resource: 'meeting.guest', action: 'update' },
      { resource: 'meeting.guest', action: 'delete' },
      { resource: 'meeting.attendance', action: 'read' },
      { resource: 'identity.role_assignment', action: 'read' },
      { resource: 'library.governance_document', action: 'read' },
      { resource: 'library.item', action: 'read' },
      { resource: 'library.content_plan', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'create' },
      { resource: 'governance.club_success_plan', action: 'update' },
      { resource: 'education.mentorship', action: 'read' },
      { resource: 'education.onboarding', action: 'read' },
      { resource: 'governance.excom_meeting', action: 'read' },
      { resource: 'governance.motion', action: 'read' },
      { resource: 'governance.minutes', action: 'read' },
      { resource: 'identity.club_member', action: 'read' },
      // CLAUDE.md §2 decision 11 (2026-07-30): VP Membership dashboard —
      // the restricted health-signal read is what keeps the roster
      // (name/email/phone/band) VPM-only; speech_slot read backs the
      // per-member speech-history drill-down.
      { resource: 'membership.health_signal', action: 'read' },
      { resource: 'meeting.speech_slot', action: 'read' },
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
      { resource: 'meeting.planner', action: 'read' },
      { resource: 'meeting.agenda_item', action: 'read' },
      { resource: 'meeting.speech_slot', action: 'read' },
      { resource: 'meeting.speech_slot', action: 'create' },
      { resource: 'meeting.checklist', action: 'read' },
      { resource: 'meeting.live_record', action: 'read' },
      { resource: 'meeting.live_record', action: 'create' },
      { resource: 'meeting.ballot', action: 'read' },
      { resource: 'meeting.vote', action: 'create' },
      { resource: 'meeting.guest', action: 'read' },
      { resource: 'meeting.attendance', action: 'read' },
      { resource: 'meeting.resource', action: 'read' },
      { resource: 'identity.role_assignment', action: 'read' },
      { resource: 'finance.ledger', action: 'read', condition: 'own' },
      { resource: 'finance.dues', action: 'read', condition: 'own' },
      { resource: 'finance.invoice', action: 'read', condition: 'own' },
      { resource: 'finance.installment_plan', action: 'read', condition: 'own' },
      { resource: 'library.item', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'education.record', action: 'read', condition: 'own' },
      { resource: 'education.record', action: 'update', condition: 'own' },
      { resource: 'education.approval', action: 'read', condition: 'own' },
      { resource: 'education.evaluation', action: 'read', condition: 'own' },
      { resource: 'education.evaluation', action: 'create' },
      { resource: 'education.mentorship', action: 'read', condition: 'own' },
      { resource: 'education.onboarding', action: 'read', condition: 'own' },
      { resource: 'education.onboarding', action: 'update', condition: 'own' },
      { resource: 'governance.minutes', action: 'read', condition: 'published' },
      { resource: 'support.request', action: 'read' },
      { resource: 'identity.club_member', action: 'read' },
    ],
    // finance.report is club-wide (opening/closing balances, member counts),
    // not per-member — it deliberately gets no `own`-condition grant here;
    // read access is Treasurer/President only, same as finance.ledger's
    // full (non-`own`) read.
  },
  {
    // M5 Slice 5: system-design.md §7.5. Did not exist before M5 — no
    // milestone needed the VP Public Relations module until the library and
    // content planner shipped.
    role: 'club_vppr',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Vice President Public Relations',
    grants: [
      { resource: 'library.item', action: 'read' },
      { resource: 'library.item', action: 'create' },
      { resource: 'library.item', action: 'update' },
      { resource: 'library.governance_document', action: 'read' },
      { resource: 'library.content_plan', action: 'read' },
      { resource: 'library.content_plan', action: 'create' },
      { resource: 'library.content_plan', action: 'update' },
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'governance.excom_meeting', action: 'read' },
      { resource: 'governance.motion', action: 'read' },
      { resource: 'governance.minutes', action: 'read' },
      { resource: 'identity.club_member', action: 'read' },
    ],
  },
  {
    // M5 Slice 5: system-design.md §7.5. Sergeant at Arms: meeting logistics
    // and checklists (already granted via the pre-existing `meeting.checklist`
    // resource — M3), inventory, club costs.
    role: 'club_saa',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Sergeant at Arms',
    grants: [
      { resource: 'operations.inventory', action: 'read' },
      { resource: 'operations.inventory', action: 'create' },
      { resource: 'operations.inventory', action: 'update' },
      { resource: 'meeting.checklist', action: 'read' },
      { resource: 'meeting.checklist', action: 'create' },
      { resource: 'meeting.checklist', action: 'update' },
      // M9: the SAA works the door, so they take the headcount.
      { resource: 'meeting.attendance', action: 'read' },
      { resource: 'meeting.attendance', action: 'create' },
      { resource: 'meeting.guest', action: 'read' },
      { resource: 'meeting.resource', action: 'read' },
      { resource: 'library.governance_document', action: 'read' },
      { resource: 'library.item', action: 'read' },
      { resource: 'meeting.meeting', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'governance.excom_meeting', action: 'read' },
      { resource: 'governance.motion', action: 'read' },
      { resource: 'governance.minutes', action: 'read' },
      { resource: 'identity.club_member', action: 'read' },
    ],
  },
  {
    // M5 Slice 5: system-design.md §7.5. Governance-document custodian
    // (minutes archival lands here properly in M8 — this role and its
    // `library.governance_document` write exist from M5 so M8 has an owner
    // to hand records to, not a retrofit).
    role: 'club_secretary',
    tier: 'club',
    unitTypes: ['club'],
    scopeRule: 'self_unit',
    isSingleton: true,
    label: 'Secretary',
    grants: [
      { resource: 'library.governance_document', action: 'read' },
      { resource: 'library.governance_document', action: 'create' },
      { resource: 'library.governance_document', action: 'update' },
      { resource: 'library.item', action: 'read' },
      { resource: 'meeting.checklist', action: 'read' },
      { resource: 'meeting.meeting', action: 'read' },
      // M9: the Secretary keeps the attendance record of the meeting.
      { resource: 'meeting.attendance', action: 'read' },
      { resource: 'meeting.attendance', action: 'create' },
      { resource: 'meeting.resource', action: 'read' },
      { resource: 'identity.role_assignment', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'governance.excom_meeting', action: 'read' },
      { resource: 'governance.excom_meeting', action: 'create' },
      { resource: 'governance.excom_meeting', action: 'update' },
      { resource: 'governance.motion', action: 'read' },
      { resource: 'governance.motion', action: 'create' },
      { resource: 'governance.motion', action: 'update' },
      { resource: 'governance.minutes', action: 'read' },
      { resource: 'governance.minutes', action: 'create' },
      { resource: 'governance.minutes', action: 'update' },
      { resource: 'identity.club_member', action: 'read' },
    ],
  },
  {
    // M6 Slice 6: system-design.md §7.6. Did not exist before M6 — no
    // milestone needed the area tier until the Area Director's own
    // artefacts (visit reports, contact log) shipped.
    role: 'area_director',
    tier: 'area',
    unitTypes: ['area'],
    scopeRule: 'self_subtree',
    isSingleton: true,
    label: 'Area Director',
    grants: [
      { resource: 'quality.area_visit_report', action: 'read' },
      { resource: 'quality.area_visit_report', action: 'create' },
      { resource: 'quality.area_visit_report', action: 'update' },
      { resource: 'quality.president_contact_log', action: 'read' },
      { resource: 'quality.president_contact_log', action: 'create' },
      { resource: 'quality.dcp_projection', action: 'read' },
      { resource: 'quality.health_snapshot', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'quality.ticket', action: 'read' },
      { resource: 'quality.ticket', action: 'create' },
      { resource: 'quality.ticket', action: 'update' },
      { resource: 'meeting.meeting', action: 'read' },
    ],
  },
  {
    // M6 Slice 6: system-design.md §7.6. Div Dir row — mostly read, plus
    // ticket write and council-record ownership at its own tier.
    role: 'division_director',
    tier: 'division',
    unitTypes: ['division'],
    scopeRule: 'self_subtree',
    isSingleton: true,
    label: 'Division Director',
    grants: [
      { resource: 'quality.area_visit_report', action: 'read' },
      { resource: 'quality.president_contact_log', action: 'read' },
      { resource: 'quality.dcp_projection', action: 'read' },
      { resource: 'quality.health_snapshot', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'quality.ticket', action: 'read' },
      { resource: 'quality.ticket', action: 'create' },
      { resource: 'quality.ticket', action: 'update' },
      { resource: 'meeting.meeting', action: 'read' },
    ],
  },
  {
    // Users admin follow-up: system-design.md §6.3 names district_director
    // alongside area_director/division_director as a district-tier role, but
    // no district-tier role template existed until this slice — the Users
    // page's role picker needs every tier's "director" option, not just
    // area/division. Grants mirror division_director's row exactly (one tier
    // up from area, one down from the platform tier).
    role: 'district_director',
    tier: 'district',
    unitTypes: ['district'],
    scopeRule: 'self_subtree',
    isSingleton: true,
    label: 'District Director',
    grants: [
      { resource: 'quality.area_visit_report', action: 'read' },
      { resource: 'quality.president_contact_log', action: 'read' },
      { resource: 'quality.dcp_projection', action: 'read' },
      { resource: 'quality.health_snapshot', action: 'read' },
      { resource: 'governance.club_success_plan', action: 'read' },
      { resource: 'quality.ticket', action: 'read' },
      { resource: 'quality.ticket', action: 'create' },
      { resource: 'quality.ticket', action: 'update' },
      { resource: 'meeting.meeting', action: 'read' },
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
      { resource: 'identity.invitation', action: 'read' },
      { resource: 'identity.invitation', action: 'update' },
      { resource: 'identity.role_assignment', action: 'create' },
      // Users admin (system-design.md §7.7: "Person search across units …
      // unit_admin = within subtree").
      { resource: 'identity.person', action: 'read' },
      { resource: 'identity.person', action: 'create' },
      { resource: 'identity.person', action: 'update' },
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
    grants: [
      // system-design.md §7.7: "support_readonly = R (audited)".
      { resource: 'identity.person', action: 'read' },
      { resource: 'identity.invitation', action: 'read' },
    ],
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
  // M10: the remaining ten TI paths, names and credentials only. The club
  // education roster needs a real path list for its picker and its `Path`
  // column; the per-level project curriculum for these is *not* transcribed
  // here, because guessing it would put wrong denominators in front of a VPE.
  // A path with no seeded projects reports `required: 0` and the roster
  // renders that level as "not defined" rather than as unearned progress.
  // Extend `projects` from TI's published curriculum — no migration needed.
  {
    pathCode: 'MS',
    name: 'Motivational Strategies',
    credential: 'Motivational Strategies',
    projects: [],
  },
  {
    pathCode: 'PI',
    name: 'Persuasive Influence',
    credential: 'Persuasive Influence',
    projects: [],
  },
  {
    pathCode: 'VC',
    name: 'Visionary Communication',
    credential: 'Visionary Communication',
    projects: [],
  },
  {
    pathCode: 'SR',
    name: 'Strategic Relationships',
    credential: 'Strategic Relationships',
    projects: [],
  },
  { pathCode: 'DL', name: 'Dynamic Leadership', credential: 'Dynamic Leadership', projects: [] },
  { pathCode: 'IP', name: 'Innovative Planning', credential: 'Innovative Planning', projects: [] },
  {
    pathCode: 'LD',
    name: 'Leadership Development',
    credential: 'Leadership Development',
    projects: [],
  },
  { pathCode: 'EC', name: 'Effective Coaching', credential: 'Effective Coaching', projects: [] },
  { pathCode: 'TC', name: 'Team Collaboration', credential: 'Team Collaboration', projects: [] },
  { pathCode: 'EH', name: 'Engaging Humor', credential: 'Engaging Humor', projects: [] },
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
