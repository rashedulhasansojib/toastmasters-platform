import { z } from 'zod';
import { orgUnit, orgUnitType } from './org';

export const personStatus = z.enum(['invited', 'active', 'disabled']);
export type PersonStatus = z.infer<typeof personStatus>;

export const person = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string().min(1),
  phone: z.string().nullable(),
  photoUrl: z.string().nullable(),
  bio: z.string().nullable(),
  tiMemberNumber: z.string().nullable(),
  status: personStatus,
  mfaEnabled: z.boolean(),
  permissionVersion: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  lastLoginAt: z.iso.datetime().nullable(),
});
// `passwordHash` is deliberately absent — it never leaves the repository layer.
export type Person = z.infer<typeof person>;

/** Email is deliberately not editable here — it is the login/invitation-matching key. */
export const updatePersonRequestSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    phone: z.string().min(1).nullable().optional(),
    tiMemberNumber: z.string().min(1).nullable().optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdatePersonRequest = z.infer<typeof updatePersonRequestSchema>;

export const personSearchQuerySchema = z
  .object({
    q: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(100).default(25),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();
export type PersonSearchQuery = z.infer<typeof personSearchQuerySchema>;

export const clubMemberType = z.enum([
  'new',
  'renewing',
  'dual',
  'reinstated',
  'charter',
  'transfer',
  'honorary',
]);
export type ClubMemberType = z.infer<typeof clubMemberType>;

/**
 * Users admin (super-admin People page). `invite` is optional — an admin can
 * create a bare Person record and invite them into a role later from the
 * detail page, per system-design.md §6.3 (membership/role assignment has no
 * ordering dependency on the invite step). `invite.memberType` mirrors
 * `createInvitationRequestSchema`'s own field — meaningful only when
 * `invite.orgUnitId` is a club.
 */
export const createPersonRequestSchema = z
  .object({
    fullName: z.string().min(1),
    email: z.email(),
    phone: z.string().min(1).optional(),
    tiMemberNumber: z.string().min(1).optional(),
    invite: z
      .object({
        orgUnitId: z.uuid(),
        role: z.string().min(1),
        programYearId: z.string().min(1),
        memberType: clubMemberType.optional(),
      })
      .optional(),
  })
  .strict();
export type CreatePersonRequest = z.infer<typeof createPersonRequestSchema>;

export const clubMembershipTiStanding = z.enum(['good', 'lapsed', 'unknown']);
export const clubMembershipLocalStatus = z.enum(['active', 'inactive', 'on_leave', 'suspended']);
export const clubMembershipProvenance = z.enum(['portal', 'ti_import']);

export const clubMembership = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  clubUnitId: z.uuid(),
  memberType: clubMemberType,
  joinedAt: z.iso.datetime(),
  leftAt: z.iso.datetime().nullable(),
  isPrimary: z.boolean(),
  tiStanding: clubMembershipTiStanding,
  localStatus: clubMembershipLocalStatus,
  provenance: clubMembershipProvenance,
  lastReconciledAt: z.iso.datetime().nullable(),
});
export type ClubMembership = z.infer<typeof clubMembership>;

/**
 * M9: the club's own roster, for member pickers on the meeting page.
 * Deliberately narrower than `person` — a picker needs a name and an id,
 * not email/phone/photo/TI number, and this is read by every club role.
 */
export const clubMemberSummary = z.object({
  personId: z.uuid(),
  fullName: z.string().min(1),
  memberType: clubMemberType,
  localStatus: clubMembershipLocalStatus,
});
export type ClubMemberSummary = z.infer<typeof clubMemberSummary>;

export const roleAssignmentStatus = z.enum(['pending', 'active', 'ended', 'revoked']);
export type RoleAssignmentStatus = z.infer<typeof roleAssignmentStatus>;

export const roleAssignmentEndedReason = z.enum(['term_end', 'resigned', 'removed', 'succeeded']);
export type RoleAssignmentEndedReason = z.infer<typeof roleAssignmentEndedReason>;

export const roleAssignment = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  orgUnitId: z.uuid(),
  // Plain string until Slice 3 seeds role_template and this narrows to a
  // catalogued RoleKey — see rbac-design.md §3 table 2.
  role: z.string().min(1),
  programYearId: z.string().min(1),
  termStart: z.iso.date(),
  termEnd: z.iso.date(),
  status: roleAssignmentStatus,
  appointedBy: z.uuid(),
  appointedAt: z.iso.datetime(),
  trainedAt: z.array(z.object({ period: z.enum(['R1', 'R2']), at: z.iso.datetime() })),
  endedReason: roleAssignmentEndedReason.nullable(),
});
export type RoleAssignment = z.infer<typeof roleAssignment>;

/**
 * Slice 9: the HTTP surface for appointing an officer — e.g. a President
 * assigning a VPE (prd.md FR-ACC-8). `memberType` is optional and only
 * meaningful when the target org unit is a club — the Users admin page
 * always sends it there so the assignment also upserts an active
 * ClubMembership; the pre-existing club-scoped route can still omit it.
 */
export const createRoleAssignmentRequestSchema = z
  .object({
    personId: z.uuid(),
    role: z.string().min(1),
    programYearId: z.string().min(1),
    termStart: z.iso.date(),
    termEnd: z.iso.date(),
    memberType: clubMemberType.optional(),
  })
  .strict();
export type CreateRoleAssignmentRequest = z.infer<typeof createRoleAssignmentRequestSchema>;

/**
 * `warnings` carries the non-blocking `DirectorRequiresClubMembership`
 * notice (system-design.md §6.3) — a district/division/area role assigned to
 * someone with no active club membership yet is still created, just flagged.
 */
export const createRoleAssignmentResponseSchema = z.object({
  roleAssignment,
  warnings: z.array(z.string()),
});
export type CreateRoleAssignmentResponse = z.infer<typeof createRoleAssignmentResponseSchema>;

export const endRoleAssignmentRequestSchema = z
  .object({ reason: roleAssignmentEndedReason })
  .strict();
export type EndRoleAssignmentRequest = z.infer<typeof endRoleAssignmentRequestSchema>;

export const roleTemplateTier = z.enum(['club', 'area', 'division', 'district', 'platform']);
export type RoleTemplateTier = z.infer<typeof roleTemplateTier>;

/** The Users admin role picker's catalogue — seeded data, never a hardcoded union (CLAUDE.md §4). */
export const roleTemplateSummary = z.object({
  role: z.string().min(1),
  tier: roleTemplateTier,
  unitTypes: z.array(orgUnitType),
  isSingleton: z.boolean(),
  label: z.string().min(1),
});
export type RoleTemplateSummary = z.infer<typeof roleTemplateSummary>;

export const programYearStatus = z.enum(['upcoming', 'current', 'closed']);
export type ProgramYearStatus = z.infer<typeof programYearStatus>;

export const programYear = z.object({
  id: z.string().min(1), // e.g. "2026-2027"
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  status: programYearStatus,
});
export type ProgramYear = z.infer<typeof programYear>;

/** Slice 8: login + session. Never carries the password hash or the raw JWT — the token lives only in the httpOnly cookie. */
export const loginRequestSchema = z
  .object({
    email: z.email(),
    password: z.string().min(1),
  })
  .strict();
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const switchUnitRequestSchema = z
  .object({
    orgUnitId: z.uuid(),
  })
  .strict();
export type SwitchUnitRequest = z.infer<typeof switchUnitRequestSchema>;

export const invitationStatus = z.enum(['pending', 'accepted', 'expired', 'revoked']);
export type InvitationStatus = z.infer<typeof invitationStatus>;

/** Slice 1 (M2): system-design.md §6.4. tokenHash — and the raw token — never appear here; the raw token is only ever emailed. */
export const invitation = z.object({
  id: z.uuid(),
  email: z.email(),
  orgUnitId: z.uuid(),
  role: z.string().min(1),
  // Only meaningful when orgUnit.type === 'club' — see the Prisma model comment.
  memberType: clubMemberType.nullable(),
  programYearId: z.string().min(1),
  invitedBy: z.uuid(),
  status: invitationStatus,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
  acceptedPersonId: z.uuid().nullable(),
});
export type Invitation = z.infer<typeof invitation>;

export const createInvitationRequestSchema = z
  .object({
    email: z.email(),
    role: z.string().min(1),
    programYearId: z.string().min(1),
    memberType: clubMemberType.optional(),
  })
  .strict();
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

/**
 * `create`/`resend` responses only — the raw token (and therefore the
 * accept link) exists only at mint time, never persisted in the clear and
 * never re-fetchable afterwards, same "issue once, copy, no saved list"
 * shape as the guest capability-token card.
 */
export const invitationWithLink = invitation.extend({ inviteUrl: z.url() });
export type InvitationWithLink = z.infer<typeof invitationWithLink>;

export const acceptInvitationRequestSchema = z
  .object({
    fullName: z.string().min(1),
    password: z.string().min(8),
  })
  .strict();
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

export const sessionResponseSchema = z.object({
  personId: z.uuid(),
  fullName: z.string(),
  activeUnitId: z.uuid().nullable(),
  programYearId: z.string().nullable(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Slice 6 (M2): the unit switcher's candidate list — a lean subset of `orgUnit`, not the full shape. */
export const switchableUnit = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  type: orgUnitType,
  path: z.string().min(1),
});
export type SwitchableUnit = z.infer<typeof switchableUnit>;

// --- Users admin (super-admin People page) -------------------------------

/** One row of the search table's "Roles / Groups" badge list. */
export const personRoleBadge = z.object({
  roleAssignmentId: z.uuid(),
  role: z.string().min(1),
  orgUnitId: z.uuid(),
  orgUnitName: z.string().min(1),
  orgUnitType,
  status: roleAssignmentStatus,
});
export type PersonRoleBadge = z.infer<typeof personRoleBadge>;

export const personClubBadge = z.object({
  clubMembershipId: z.uuid(),
  clubUnitId: z.uuid(),
  clubName: z.string().min(1),
  memberType: clubMemberType,
  localStatus: clubMembershipLocalStatus,
});
export type PersonClubBadge = z.infer<typeof personClubBadge>;

/** `orgUnitId: null` is system_admin/support_readonly — global reach, no unit to name. */
export const personPlatformRoleBadge = z.object({
  platformRoleAssignmentId: z.uuid(),
  role: z.string().min(1),
  orgUnitId: z.uuid().nullable(),
  orgUnitName: z.string().nullable(),
});
export type PersonPlatformRoleBadge = z.infer<typeof personPlatformRoleBadge>;

export const personPendingInvitationSummary = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  role: z.string().min(1),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type PersonPendingInvitationSummary = z.infer<typeof personPendingInvitationSummary>;

/**
 * The search table's per-row shape: active club memberships (only —
 * `localStatus: 'active'`) plus active domain role assignments plus platform
 * roles, so the "Roles / Groups" column and the "Invited / Active" status can
 * render without a second round trip per row.
 */
export const personSearchResultItem = person.extend({
  clubMemberships: z.array(personClubBadge),
  roleAssignments: z.array(personRoleBadge),
  platformRoles: z.array(personPlatformRoleBadge),
  pendingInvitation: personPendingInvitationSummary.nullable(),
});
export type PersonSearchResultItem = z.infer<typeof personSearchResultItem>;

export const personSearchResponseSchema = z.object({
  items: z.array(personSearchResultItem),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type PersonSearchResponse = z.infer<typeof personSearchResponseSchema>;

/** The edit page: full role history (including ended/revoked), not just the active set the search row shows. */
export const personDetailSchema = person.extend({
  clubMemberships: z.array(personClubBadge),
  roleAssignments: z.array(personRoleBadge),
  platformRoles: z.array(personPlatformRoleBadge),
  pendingInvitation: personPendingInvitationSummary.nullable(),
});
export type PersonDetail = z.infer<typeof personDetailSchema>;

/** The cascade picker's "here's the chain above the unit you picked" read. */
export const orgUnitAncestorsResponseSchema = z.object({
  unit: orgUnit,
  ancestors: z.array(orgUnit),
});
export type OrgUnitAncestorsResponse = z.infer<typeof orgUnitAncestorsResponseSchema>;
