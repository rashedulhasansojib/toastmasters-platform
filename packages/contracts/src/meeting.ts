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

/** M3 Slice 9: a reusable agenda template a club applies to many meetings. */
export const agendaTemplateItem = z.object({
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  plannedDurationSeconds: z.number().int().positive(),
  roleKey: z.string().min(1).nullable(),
});
export type AgendaTemplateItem = z.infer<typeof agendaTemplateItem>;

export const agendaTemplate = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  name: z.string().min(1),
  items: z.array(agendaTemplateItem),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AgendaTemplate = z.infer<typeof agendaTemplate>;

export const createAgendaTemplateRequestSchema = z
  .object({
    name: z.string().min(1),
    items: z.array(agendaTemplateItem.omit({ order: true })).min(1),
  })
  .strict();
export type CreateAgendaTemplateRequest = z.infer<typeof createAgendaTemplateRequestSchema>;

export const applyAgendaTemplateRequestSchema = z.object({ templateId: z.uuid() }).strict();
export type ApplyAgendaTemplateRequest = z.infer<typeof applyAgendaTemplateRequestSchema>;

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

/** M3 Slice 8: system-design.md §9.3 — ranked, reasoned suggestions, never auto-assignment. */
export const roleRotationSuggestion = z.object({
  personId: z.uuid(),
  fullName: z.string(),
  lastFulfilledAt: z.iso.datetime().nullable(),
  stalenessDays: z.number().int().nonnegative().nullable(),
  reason: z.string(),
});
export type RoleRotationSuggestion = z.infer<typeof roleRotationSuggestion>;

export const speechSlotStatus = z.enum(['requested', 'approved', 'declined']);
export type SpeechSlotStatus = z.infer<typeof speechSlotStatus>;

/** M3 Slice 4: system-design.md §9.1's speechSlot[] — request/approval with path validation. */
export const speechSlot = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  title: z.string().min(1),
  pathCode: z.string().min(1),
  projectCode: z.string().min(1),
  level: z.number().int().positive(),
  plannedDurationSeconds: z.number().int().positive(),
  requestedBy: z.uuid(),
  status: speechSlotStatus,
  createdAt: z.iso.datetime(),
});
export type SpeechSlot = z.infer<typeof speechSlot>;

/** `level` is derived server-side from the matched PathwayProject — never client-supplied. */
export const createSpeechSlotRequestSchema = z
  .object({
    title: z.string().min(1),
    pathCode: z.string().min(1),
    projectCode: z.string().min(1),
    plannedDurationSeconds: z.number().int().positive(),
  })
  .strict();
export type CreateSpeechSlotRequest = z.infer<typeof createSpeechSlotRequestSchema>;

export const decideSpeechSlotRequestSchema = z
  .object({
    status: z.enum(['approved', 'declined']),
  })
  .strict();
export type DecideSpeechSlotRequest = z.infer<typeof decideSpeechSlotRequestSchema>;

export const checklistPhase = z.enum(['before', 'during', 'after']);
export type ChecklistPhase = z.infer<typeof checklistPhase>;

export const checklistAppliesTo = z.enum(['meeting', 'excom', 'contest', 'special_event']);
export type ChecklistAppliesTo = z.infer<typeof checklistAppliesTo>;

export const checklistTemplateItem = z.object({
  key: z.string().min(1),
  order: z.number().int().nonnegative(),
  label: z.string().min(1),
  ownerRole: z.string().nullable(),
  phase: checklistPhase,
});
export type ChecklistTemplateItem = z.infer<typeof checklistTemplateItem>;

/** M3 Slice 5: system-design.md §14.1. */
export const checklistTemplate = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  name: z.string().min(1),
  appliesTo: checklistAppliesTo,
  items: z.array(checklistTemplateItem),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type ChecklistTemplate = z.infer<typeof checklistTemplate>;

export const createChecklistTemplateRequestSchema = z
  .object({
    name: z.string().min(1),
    appliesTo: checklistAppliesTo,
    items: z.array(checklistTemplateItem.omit({ order: true })).min(1),
  })
  .strict();
export type CreateChecklistTemplateRequest = z.infer<typeof createChecklistTemplateRequestSchema>;

export const checklistRunItem = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  phase: checklistPhase,
  done: z.boolean(),
  doneBy: z.uuid().nullable(),
  doneAt: z.iso.datetime().nullable(),
  note: z.string().nullable(),
});
export type ChecklistRunItem = z.infer<typeof checklistRunItem>;

export const checklistRun = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  templateId: z.uuid(),
  meetingId: z.uuid().nullable(),
  items: z.array(checklistRunItem),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type ChecklistRun = z.infer<typeof checklistRun>;

export const createChecklistRunRequestSchema = z
  .object({
    templateId: z.uuid(),
  })
  .strict();
export type CreateChecklistRunRequest = z.infer<typeof createChecklistRunRequestSchema>;

export const markChecklistRunItemRequestSchema = z
  .object({
    key: z.string().min(1),
    done: z.boolean(),
    note: z.string().nullable().optional(),
  })
  .strict();
export type MarkChecklistRunItemRequest = z.infer<typeof markChecklistRunItemRequestSchema>;

/** M3 Slice 6: the guest capability-token primitive. Raw `token` is present only on issue — never persisted, never returned again. */
export const capabilityTokenIssued = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  purpose: z.string().min(1),
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type CapabilityTokenIssued = z.infer<typeof capabilityTokenIssued>;

export const issueCapabilityTokenRequestSchema = z
  .object({
    purpose: z.string().min(1),
    ttlMinutes: z.number().int().positive().max(720).optional(),
  })
  .strict();
export type IssueCapabilityTokenRequest = z.infer<typeof issueCapabilityTokenRequestSchema>;

export const verifyCapabilityTokenRequestSchema = z.object({ token: z.string().min(1) }).strict();
export type VerifyCapabilityTokenRequest = z.infer<typeof verifyCapabilityTokenRequestSchema>;

export const capabilityTokenVerification = z.object({
  valid: z.boolean(),
  meetingId: z.uuid().nullable(),
  purpose: z.string().nullable(),
});
export type CapabilityTokenVerification = z.infer<typeof capabilityTokenVerification>;

/**
 * M3 Slice 7: system-design.md §9.1's timerRecord/ahCounterRecord/
 * grammarianRecord, one write path with a `kind` discriminator (see the
 * Slice 7 plan note). `clientKey` is client-minted so a venue-wifi drop can
 * safely retry the same write (FR-MTG-6/NFR-3) — the server returns the
 * originally-stored record unchanged on a repeat key, never a duplicate.
 */
const liveRecordTargetFields = {
  clientKey: z.string().min(1),
  targetRoleAssignmentId: z.uuid().optional(),
  targetLabel: z.string().min(1).optional(),
};

export const createMeetingLiveRecordRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('timer'),
      ...liveRecordTargetFields,
      payload: z.object({
        category: z.string().min(1),
        elapsedMs: z.number().int().nonnegative(),
        signal: z.enum(['green', 'yellow', 'red']).nullable(),
      }),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ah_counter'),
      ...liveRecordTargetFields,
      payload: z.object({
        counts: z.array(
          z.object({ word: z.string().min(1), count: z.number().int().nonnegative() }),
        ),
      }),
    })
    .strict(),
  z
    .object({
      kind: z.literal('grammarian'),
      ...liveRecordTargetFields,
      payload: z.object({
        wordOfDayUses: z.number().int().nonnegative(),
        corrections: z.array(
          z.object({ said: z.string().min(1), shouldHaveBeen: z.string().min(1) }),
        ),
      }),
    })
    .strict(),
]);
export type CreateMeetingLiveRecordRequest = z.infer<typeof createMeetingLiveRecordRequestSchema>;

export const meetingLiveRecord = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  kind: z.enum(['timer', 'ah_counter', 'grammarian']),
  clientKey: z.string(),
  targetRoleAssignmentId: z.uuid().nullable(),
  targetLabel: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  recordedBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type MeetingLiveRecord = z.infer<typeof meetingLiveRecord>;
