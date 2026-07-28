import { z } from 'zod';

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

export const sessionResponseSchema = z.object({
  personId: z.uuid(),
  fullName: z.string(),
  activeUnitId: z.uuid().nullable(),
  programYearId: z.string().nullable(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
