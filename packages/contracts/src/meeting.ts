import { z } from 'zod';

/**
 * Deliberately bare (Slice 9 of the M1 walking-skeleton plan): a record to
 * hang authorization on, not the full meeting-operations entity
 * (system-design.md's agenda/roles/speech-slots/lifecycle) — that's a later
 * milestone.
 */
export const meeting = z.object({
  id: z.uuid(),
  clubUnitId: z.uuid(),
  programYearId: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type Meeting = z.infer<typeof meeting>;

export const createMeetingRequestSchema = z
  .object({
    programYearId: z.string().min(1),
    scheduledAt: z.iso.datetime(),
  })
  .strict();
export type CreateMeetingRequest = z.infer<typeof createMeetingRequestSchema>;

/** M3 Slice 1: system-design.md §9.1's agendaItem[] — position is server-assigned, never client-supplied. */
export const agendaItem = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  position: z.number().int().positive(),
  title: z.string().min(1),
  plannedDurationSeconds: z.number().int().positive(),
  roleKey: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AgendaItem = z.infer<typeof agendaItem>;

export const createAgendaItemRequestSchema = z
  .object({
    title: z.string().min(1),
    plannedDurationSeconds: z.number().int().positive(),
    roleKey: z.string().min(1).optional(),
  })
  .strict();
export type CreateAgendaItemRequest = z.infer<typeof createAgendaItemRequestSchema>;

/** system-design.md §9.2's fixed roleKey vocabulary. */
export const meetingRoleKey = z.enum([
  'toastmaster',
  'general_evaluator',
  'table_topics_master',
  'timer',
  'ah_counter',
  'grammarian',
  'sergeant_at_arms',
  'speaker',
  'evaluator',
]);
export type MeetingRoleKey = z.infer<typeof meetingRoleKey>;

export const meetingRoleAssignmentStatus = z.enum([
  'proposed',
  'confirmed',
  'declined',
  'fulfilled',
  'no_show',
]);
export type MeetingRoleAssignmentStatus = z.infer<typeof meetingRoleAssignmentStatus>;

/**
 * M3 Slice 3 scoping: `guest` (§9.2) is deferred — it references a Prospect
 * row that doesn't exist until M4.
 */
export const meetingRoleAssignee = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('member'), personId: z.uuid() }).strict(),
  z
    .object({ kind: z.literal('cross_club'), personId: z.uuid(), homeClubUnitId: z.uuid() })
    .strict(),
  z.object({ kind: z.literal('unfilled') }).strict(),
]);
export type MeetingRoleAssignee = z.infer<typeof meetingRoleAssignee>;

/** M3 Slice 3: system-design.md §9.2 — role assignments reference identity, not strings. */
export const meetingRoleAssignment = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  roleKey: meetingRoleKey,
  slotIndex: z.number().int().nonnegative().nullable(),
  assignee: meetingRoleAssignee,
  status: meetingRoleAssignmentStatus,
  confirmedAt: z.iso.datetime().nullable(),
  fulfilledAt: z.iso.datetime().nullable(),
  declinedReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type MeetingRoleAssignment = z.infer<typeof meetingRoleAssignment>;

export const createMeetingRoleAssignmentRequestSchema = z
  .object({
    roleKey: meetingRoleKey,
    slotIndex: z.number().int().nonnegative().optional(),
    assignee: meetingRoleAssignee,
  })
  .strict();
export type CreateMeetingRoleAssignmentRequest = z.infer<
  typeof createMeetingRoleAssignmentRequestSchema
>;
