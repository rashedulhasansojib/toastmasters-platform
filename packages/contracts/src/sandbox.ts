import { z } from 'zod';

/**
 * The public sandbox dashboard — what a person with no ClubMembership/
 * RoleAssignment anywhere sees instead of a dead end (the platform
 * dashboard's demo-signup QR/link is the on-ramp). Deliberately simplified,
 * self-contained shapes, distinct from the real per-context contracts:
 * nothing here is ever persisted (apps/api's `sandbox` module has no
 * `*.repository.ts` by design — see its module comment).
 */

export const sandboxMember = z.object({
  id: z.string(),
  fullName: z.string().min(1),
  role: z.string().min(1),
  email: z.email(),
  joinedAt: z.iso.date(),
  pathway: z.string().min(1),
  pathwayLevel: z.number().int().min(1).max(5),
});
export type SandboxMember = z.infer<typeof sandboxMember>;

export const createSandboxMemberRequestSchema = z
  .object({
    fullName: z.string().min(1),
    role: z.string().min(1),
    email: z.email(),
    pathway: z.string().min(1),
  })
  .strict();
export type CreateSandboxMemberRequest = z.infer<typeof createSandboxMemberRequestSchema>;

export const sandboxAgendaItem = z.object({
  id: z.string(),
  order: z.number().int(),
  title: z.string().min(1),
  speaker: z.string().nullable(),
  durationMinutes: z.number().int().min(1),
});
export type SandboxAgendaItem = z.infer<typeof sandboxAgendaItem>;

export const createSandboxAgendaItemRequestSchema = z
  .object({
    title: z.string().min(1),
    speaker: z.string().nullable().optional(),
    durationMinutes: z.number().int().min(1),
  })
  .strict();
export type CreateSandboxAgendaItemRequest = z.infer<typeof createSandboxAgendaItemRequestSchema>;

export const sandboxMeetingStatus = z.enum(['upcoming', 'completed']);
export type SandboxMeetingStatus = z.infer<typeof sandboxMeetingStatus>;

export const sandboxMeeting = z.object({
  id: z.string(),
  theme: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  status: sandboxMeetingStatus,
  agenda: z.array(sandboxAgendaItem),
});
export type SandboxMeeting = z.infer<typeof sandboxMeeting>;

export const createSandboxMeetingRequestSchema = z
  .object({
    theme: z.string().min(1),
    scheduledAt: z.iso.datetime(),
  })
  .strict();
export type CreateSandboxMeetingRequest = z.infer<typeof createSandboxMeetingRequestSchema>;

export const sandboxPlannerEntry = z.object({
  id: z.string(),
  meetingDate: z.iso.date(),
  theme: z.string().min(1),
  toastmaster: z.string().nullable(),
  generalEvaluator: z.string().nullable(),
});
export type SandboxPlannerEntry = z.infer<typeof sandboxPlannerEntry>;

export const createSandboxPlannerEntryRequestSchema = z
  .object({
    meetingDate: z.iso.date(),
    theme: z.string().min(1),
    toastmaster: z.string().nullable().optional(),
    generalEvaluator: z.string().nullable().optional(),
  })
  .strict();
export type CreateSandboxPlannerEntryRequest = z.infer<
  typeof createSandboxPlannerEntryRequestSchema
>;

export const sandboxGuestPipelineStatus = z.enum(['new', 'invited', 'visited', 'converted']);
export type SandboxGuestPipelineStatus = z.infer<typeof sandboxGuestPipelineStatus>;

export const sandboxGuest = z.object({
  id: z.string(),
  fullName: z.string().min(1),
  email: z.email().nullable(),
  invitedBy: z.string().nullable(),
  pipelineStatus: sandboxGuestPipelineStatus,
  visitedAt: z.iso.date().nullable(),
});
export type SandboxGuest = z.infer<typeof sandboxGuest>;

export const createSandboxGuestRequestSchema = z
  .object({
    fullName: z.string().min(1),
    email: z.email().nullable().optional(),
    invitedBy: z.string().nullable().optional(),
  })
  .strict();
export type CreateSandboxGuestRequest = z.infer<typeof createSandboxGuestRequestSchema>;

export const updateSandboxGuestRequestSchema = z
  .object({
    pipelineStatus: sandboxGuestPipelineStatus,
  })
  .strict();
export type UpdateSandboxGuestRequest = z.infer<typeof updateSandboxGuestRequestSchema>;

export const sandboxEducationRecord = z.object({
  memberId: z.string(),
  memberName: z.string().min(1),
  pathway: z.string().min(1),
  level: z.number().int().min(1).max(5),
  projectsCompleted: z.number().int().min(0),
  projectsTotal: z.number().int().min(1),
});
export type SandboxEducationRecord = z.infer<typeof sandboxEducationRecord>;

export const sandboxState = z.object({
  members: z.array(sandboxMember),
  meetings: z.array(sandboxMeeting),
  planner: z.array(sandboxPlannerEntry),
  guests: z.array(sandboxGuest),
  education: z.array(sandboxEducationRecord),
});
export type SandboxState = z.infer<typeof sandboxState>;
