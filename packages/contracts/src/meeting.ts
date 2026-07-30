import { z } from 'zod';

/**
 * Deliberately bare at first (Slice 9 of the M1 walking-skeleton plan): a
 * record to hang authorization on. M3 built the aggregate underneath it;
 * Slice 11 adds the lifecycle status system-design.md §9.5 describes.
 */
export const meetingStatus = z.enum(['draft', 'published', 'in_progress', 'closed', 'cancelled']);
export type MeetingStatus = z.infer<typeof meetingStatus>;

/**
 * Descriptive fields carried over from the legacy portal. All nullable so
 * draft meetings stay cheap to create; edited from the detail or create
 * form. `wordOfDay` and `tableTopicQuestions` are JSON columns rather than
 * side tables — they don't have relationships to other rows.
 */
export const wordOfDay = z.object({
  word: z.string().max(80).default(''),
  partOfSpeech: z.string().max(30).default(''),
  meaning: z.string().max(500).default(''),
  example: z.string().max(500).default(''),
});
export type WordOfDay = z.infer<typeof wordOfDay>;

export const tableTopicQuestion = z.object({
  text: z.string().min(1).max(500),
  completed: z.boolean().default(false),
});
export type TableTopicQuestion = z.infer<typeof tableTopicQuestion>;

export const meeting = z.object({
  id: z.uuid(),
  clubUnitId: z.uuid(),
  programYearId: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  status: meetingStatus,
  title: z.string().nullable(),
  theme: z.string().nullable(),
  venue: z.string().nullable(),
  meetingNumber: z.number().int().nullable(),
  wordOfDay: wordOfDay.nullable(),
  tableTopicQuestions: z.array(tableTopicQuestion).nullable(),
  joinUrl: z.string().nullable(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type Meeting = z.infer<typeof meeting>;

/** M4 Slice 10: the public page's shape — deliberately narrower than `meeting`, no `createdBy`/`programYearId`/`status` (status is always 'published' by construction of the query that produces this). */
export const publicMeetingSummary = z.object({
  id: z.uuid(),
  scheduledAt: z.iso.datetime(),
});
export type PublicMeetingSummary = z.infer<typeof publicMeetingSummary>;

export const createMeetingRequestSchema = z
  .object({
    programYearId: z.string().min(1),
    scheduledAt: z.iso.datetime(),
    title: z.string().min(1).max(200).optional(),
    theme: z.string().min(1).max(200).optional(),
    venue: z.string().min(1).max(200).optional(),
    meetingNumber: z.number().int().positive().optional(),
    wordOfDay: wordOfDay.optional(),
    tableTopicQuestions: z.array(tableTopicQuestion).optional(),
    joinUrl: z.string().min(1).max(500).optional(),
  })
  .strict();
export type CreateMeetingRequest = z.infer<typeof createMeetingRequestSchema>;

/** M9: partial update of descriptive metadata. Never touches status/scheduledAt — those have lifecycle endpoints. */
export const updateMeetingRequestSchema = z
  .object({
    title: z.string().max(200).nullable().optional(),
    theme: z.string().max(200).nullable().optional(),
    venue: z.string().max(200).nullable().optional(),
    meetingNumber: z.number().int().positive().nullable().optional(),
    wordOfDay: wordOfDay.nullable().optional(),
    tableTopicQuestions: z.array(tableTopicQuestion).nullable().optional(),
    joinUrl: z.string().max(500).nullable().optional(),
    scheduledAt: z.iso.datetime().optional(),
  })
  .strict();
export type UpdateMeetingRequest = z.infer<typeof updateMeetingRequestSchema>;

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
  'table_topics_evaluator',
  'timer',
  'ah_counter',
  'grammarian',
  'sergeant_at_arms',
  'president',
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
 * Kinds a role can be assigned to. `guest` was deferred in M3 Slice 3 (Guest
 * didn't exist yet); enabled in M4 alongside the planner UX parity work — see
 * system-design.md §9.2. Guests still never authenticate — this is a
 * plan-side reference.
 */
export const meetingRoleAssigneeKind = z.enum(['member', 'cross_club', 'guest', 'unfilled']);
export type MeetingRoleAssigneeKind = z.infer<typeof meetingRoleAssigneeKind>;

export const meetingRoleAssignee = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('member'), personId: z.uuid() }).strict(),
  z
    .object({ kind: z.literal('cross_club'), personId: z.uuid(), homeClubUnitId: z.uuid() })
    .strict(),
  z.object({ kind: z.literal('guest'), guestId: z.uuid() }).strict(),
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

/** M3 Slice 11: the assignee/officer confirms or declines a proposed role assignment. `fulfilled`/`no_show` are set only by guarded close-out, never client-supplied. */
export const updateMeetingRoleAssignmentStatusRequestSchema = z
  .object({
    status: z.enum(['confirmed', 'declined']),
    declinedReason: z.string().min(1).optional(),
  })
  .strict();
export type UpdateMeetingRoleAssignmentStatusRequest = z.infer<
  typeof updateMeetingRoleAssignmentStatusRequestSchema
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

/**
 * The multi-week planner — `FR-MTG-5` / system-design.md §9.2.
 *
 * "It is a projection over role assignments, not a separate store." There is
 * deliberately no Planner table: a row is a `Meeting` and a cell is a
 * `MeetingRoleAssignment`. The legacy portal kept a parallel sheet of typed
 * names, which is exactly the thing §9.2 rules out — a name string cannot
 * distinguish three members called Rahim, and it earns no Pathways credit,
 * no rotation fairness and no attendance.
 */
export const plannerCell = z.object({
  roleKey: meetingRoleKey,
  slotIndex: z.number().int().nonnegative().nullable(),
  /** Null when the slot is unfilled — the grid renders an empty, clickable cell. */
  assignmentId: z.uuid().nullable(),
  /**
   * Which pool the assignee came from. Members and cross-club assignees
   * carry `personId`; guests carry `guestId`. `nullish()` (not `nullable()`)
   * so a mid-deploy API that hasn't been rebuilt yet — and simply omits the
   * field — doesn't hard-crash the page.
   */
  kind: meetingRoleAssigneeKind.nullish(),
  personId: z.uuid().nullish(),
  guestId: z.uuid().nullish(),
  fullName: z.string().nullable(),
  status: meetingRoleAssignmentStatus.nullable(),
});
export type PlannerCell = z.infer<typeof plannerCell>;

export const plannerRow = z.object({
  meetingId: z.uuid(),
  scheduledAt: z.iso.datetime(),
  title: z.string().nullable(),
  theme: z.string().nullable(),
  status: meetingStatus,
  cells: z.array(plannerCell),
});
export type PlannerRow = z.infer<typeof plannerRow>;

/**
 * One spreadsheet row. `names` are raw strings straight off the sheet — the
 * server resolves them against club members and reports whatever it could not
 * match, rather than guessing.
 */
export const plannerImportCell = z
  .object({
    roleKey: meetingRoleKey,
    slotIndex: z.number().int().nonnegative().optional(),
    name: z.string().min(1),
  })
  .strict();
export type PlannerImportCell = z.infer<typeof plannerImportCell>;

export const plannerImportRow = z
  .object({
    scheduledAt: z.iso.datetime(),
    theme: z.string().min(1).max(200).optional(),
    cells: z.array(plannerImportCell),
  })
  .strict();
export type PlannerImportRow = z.infer<typeof plannerImportRow>;

export const plannerImportRequestSchema = z
  .object({ rows: z.array(plannerImportRow).min(1).max(200) })
  .strict();
export type PlannerImportRequest = z.infer<typeof plannerImportRequestSchema>;

/** Why a name did not resolve. Ambiguity is a distinct case from absence — two members with the same name is precisely the failure §9.2 exists to prevent. */
export const plannerUnresolvedReason = z.enum(['no_match', 'ambiguous']);
export type PlannerUnresolvedReason = z.infer<typeof plannerUnresolvedReason>;

export const plannerUnresolvedName = z.object({
  rowIndex: z.number().int().nonnegative(),
  scheduledAt: z.iso.datetime(),
  roleKey: meetingRoleKey,
  slotIndex: z.number().int().nonnegative().nullable(),
  name: z.string(),
  reason: plannerUnresolvedReason,
});
export type PlannerUnresolvedName = z.infer<typeof plannerUnresolvedName>;

/**
 * `unresolved` is the "pending list" `FR-MTG-5` requires: the import commits
 * everything it could resolve and hands back the rest for a human, instead of
 * either failing the whole sheet or inventing an assignee.
 */
export const plannerImportResultSchema = z.object({
  meetingsCreated: z.number().int().nonnegative(),
  meetingsMatched: z.number().int().nonnegative(),
  assignmentsCreated: z.number().int().nonnegative(),
  assignmentsSkipped: z.number().int().nonnegative(),
  unresolved: z.array(plannerUnresolvedName),
});
export type PlannerImportResult = z.infer<typeof plannerImportResultSchema>;

export const speechSlotStatus = z.enum(['requested', 'approved', 'declined']);
export type SpeechSlotStatus = z.infer<typeof speechSlotStatus>;

/**
 * M3 Slice 4: system-design.md §9.1's speechSlot[] — request/approval with
 * path validation. M9: also the agenda's "Prepared Speakers" block, so it
 * carries the speaker/evaluator pairing and the running order.
 *
 * `speakerPersonId` null means the requester speaks — the self-service
 * case. A VPE filing on someone's behalf sets it explicitly.
 */
export const speechSlot = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  position: z.number().int().nonnegative(),
  title: z.string().min(1),
  pathCode: z.string().min(1),
  projectCode: z.string().min(1),
  level: z.number().int().positive(),
  plannedDurationSeconds: z.number().int().positive(),
  requestedBy: z.uuid(),
  speakerPersonId: z.uuid().nullable(),
  evaluatorPersonId: z.uuid().nullable(),
  notes: z.string().nullable(),
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
    speakerPersonId: z.uuid().optional(),
    evaluatorPersonId: z.uuid().optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();
export type CreateSpeechSlotRequest = z.infer<typeof createSpeechSlotRequestSchema>;

/** M9: edit a slot in place from the agenda. `level` still follows the project, never the client. */
export const updateSpeechSlotRequestSchema = z
  .object({
    title: z.string().min(1).optional(),
    pathCode: z.string().min(1).optional(),
    projectCode: z.string().min(1).optional(),
    plannedDurationSeconds: z.number().int().positive().optional(),
    speakerPersonId: z.uuid().nullable().optional(),
    evaluatorPersonId: z.uuid().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();
export type UpdateSpeechSlotRequest = z.infer<typeof updateSpeechSlotRequestSchema>;

export const decideSpeechSlotRequestSchema = z
  .object({
    status: z.enum(['approved', 'declined']),
  })
  .strict();
export type DecideSpeechSlotRequest = z.infer<typeof decideSpeechSlotRequestSchema>;

/**
 * M9: the seeded Pathways catalogue, exposed read-only so the agenda's
 * speaker form can offer path/project pickers instead of free text. The
 * legacy portal typed these as strings; here they resolve to the catalogue
 * that also derives the speech's level and duration bounds.
 */
export const pathwayProject = z.object({
  projectCode: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int().positive(),
  minMinutes: z.number().int().nonnegative(),
  maxMinutes: z.number().int().positive(),
  isRequired: z.boolean(),
});
export type PathwayProject = z.infer<typeof pathwayProject>;

export const pathwayPath = z.object({
  pathCode: z.string().min(1),
  name: z.string().min(1),
  credential: z.string(),
  projects: z.array(pathwayProject),
});
export type PathwayPath = z.infer<typeof pathwayPath>;

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

/**
 * M3 Slice 10: system-design.md §9.4. Scoped down (see the schema comment
 * on `Ballot`): created already `open`, member candidates only,
 * `all_present`/guest voting not yet wired.
 */
export const ballotCategory = z.enum([
  'best_speaker',
  'best_table_topic',
  'best_evaluator',
  'best_role_player',
]);
export type BallotCategory = z.infer<typeof ballotCategory>;

export const ballotStatus = z.enum(['open', 'tallied']);
export type BallotStatus = z.infer<typeof ballotStatus>;

export const ballotEligibility = z.enum(['members_present', 'all_present']);
export type BallotEligibility = z.infer<typeof ballotEligibility>;

export const ballotCandidate = z.object({ personId: z.uuid(), label: z.string().min(1) });
export type BallotCandidate = z.infer<typeof ballotCandidate>;

export const ballotTallyResult = z.object({
  winnerPersonId: z.uuid().nullable(),
  tally: z.array(z.object({ personId: z.uuid(), count: z.number().int().nonnegative() })),
  tiedWith: z.array(z.uuid()),
});
export type BallotTallyResult = z.infer<typeof ballotTallyResult>;

export const ballot = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  category: ballotCategory,
  status: ballotStatus,
  eligibility: ballotEligibility,
  candidates: z.array(ballotCandidate),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
  tallyResult: ballotTallyResult.nullable(),
  talliedAt: z.iso.datetime().nullable(),
});
export type Ballot = z.infer<typeof ballot>;

export const createBallotRequestSchema = z
  .object({
    category: ballotCategory,
    eligibility: ballotEligibility,
    candidates: z.array(ballotCandidate).min(2),
  })
  .strict();
export type CreateBallotRequest = z.infer<typeof createBallotRequestSchema>;

export const castVoteRequestSchema = z.object({ candidatePersonId: z.uuid() }).strict();
export type CastVoteRequest = z.infer<typeof castVoteRequestSchema>;

/**
 * M9 Slice 2: the meeting Guest List. Either a Guest-linked row (via
 * `guestId`) or a manual entry with just name/email/phone/notes.
 * `present` is editable — flip it if the guest ends up not showing.
 */
export const meetingGuest = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  fullName: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
  guestId: z.uuid().nullable(),
  present: z.boolean(),
  addedBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type MeetingGuest = z.infer<typeof meetingGuest>;

export const createMeetingGuestRequestSchema = z
  .object({
    fullName: z.string().min(1).max(200),
    email: z.string().max(200).optional(),
    phone: z.string().max(50).optional(),
    notes: z.string().optional(),
    guestId: z.uuid().optional(),
  })
  .strict();
export type CreateMeetingGuestRequest = z.infer<typeof createMeetingGuestRequestSchema>;

export const updateMeetingGuestRequestSchema = z
  .object({
    fullName: z.string().min(1).max(200).optional(),
    email: z.string().max(200).nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    notes: z.string().nullable().optional(),
    present: z.boolean().optional(),
  })
  .strict();
export type UpdateMeetingGuestRequest = z.infer<typeof updateMeetingGuestRequestSchema>;

/**
 * M9 Slice 3: member attendance. Append-only (NFR-4) — the client never
 * PATCHes a row, it POSTs a correcting one, so there is no update schema.
 */
export const meetingAttendanceRecord = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  personId: z.uuid(),
  present: z.boolean(),
  recordedBy: z.uuid(),
  recordedAt: z.iso.datetime(),
});
export type MeetingAttendanceRecord = z.infer<typeof meetingAttendanceRecord>;

/**
 * The roster the Attendance tab renders: the club's active members joined
 * to the latest attendance record for each. `recordedAt` is null for a
 * member nobody has marked yet — "not taken", distinct from "marked absent".
 */
export const meetingAttendanceRosterEntry = z.object({
  personId: z.uuid(),
  fullName: z.string(),
  present: z.boolean(),
  recordedAt: z.iso.datetime().nullable(),
});
export type MeetingAttendanceRosterEntry = z.infer<typeof meetingAttendanceRosterEntry>;

export const recordMeetingAttendanceRequestSchema = z
  .object({
    entries: z.array(z.object({ personId: z.uuid(), present: z.boolean() })).min(1),
  })
  .strict();
export type RecordMeetingAttendanceRequest = z.infer<typeof recordMeetingAttendanceRequestSchema>;

/** M9 Slice 4: free-form per-meeting notes and links. */
export const meetingResource = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  position: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type MeetingResource = z.infer<typeof meetingResource>;

export const createMeetingResourceRequestSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
  })
  .strict();
export type CreateMeetingResourceRequest = z.infer<typeof createMeetingResourceRequestSchema>;

export const updateMeetingResourceRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .strict();
export type UpdateMeetingResourceRequest = z.infer<typeof updateMeetingResourceRequestSchema>;

/**
 * M9 Slice 5: the legacy portal's reusable meeting template — default role
 * assignments, theme, venue, start time, word of the day and table topics,
 * i.e. everything "create meeting from template" copies onto the new
 * meeting.
 *
 * Deliberately no agenda line items: a Toastmasters meeting's running order
 * is fixed and derived from the roles and speakers (see the API's
 * `agenda-schedule.ts`), so there is nothing per-meeting to template. Nor
 * does it carry speakers — who speaks changes every week, which is exactly
 * why the legacy portal emptied `speakers` when applying a template.
 */
export const meetingTemplateRole = z.object({
  roleKey: meetingRoleKey,
  personId: z.uuid(),
});
export type MeetingTemplateRole = z.infer<typeof meetingTemplateRole>;

export const meetingTemplate = z.object({
  id: z.uuid(),
  clubUnitId: z.uuid(),
  name: z.string(),
  theme: z.string().nullable(),
  venue: z.string().nullable(),
  startTime: z.string().nullable(),
  joinUrl: z.string().nullable(),
  roles: z.array(meetingTemplateRole),
  wordOfDay: wordOfDay.nullable(),
  tableTopicQuestions: z.array(tableTopicQuestion).nullable(),
  isActive: z.boolean(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type MeetingTemplate = z.infer<typeof meetingTemplate>;

const meetingTemplateBody = {
  name: z.string().min(1).max(100),
  theme: z.string().max(200).nullable().optional(),
  venue: z.string().max(200).nullable().optional(),
  /** `HH:mm` — the default start time a meeting made from this template opens at. */
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be HH:mm')
    .nullable()
    .optional(),
  joinUrl: z.string().max(500).nullable().optional(),
  roles: z.array(meetingTemplateRole).optional(),
  wordOfDay: wordOfDay.nullable().optional(),
  tableTopicQuestions: z.array(tableTopicQuestion).nullable().optional(),
};

export const createMeetingTemplateRequestSchema = z.object(meetingTemplateBody).strict();
export type CreateMeetingTemplateRequest = z.infer<typeof createMeetingTemplateRequestSchema>;

export const updateMeetingTemplateRequestSchema = z
  .object({ ...meetingTemplateBody, name: meetingTemplateBody.name.optional() })
  .strict();
export type UpdateMeetingTemplateRequest = z.infer<typeof updateMeetingTemplateRequestSchema>;

/**
 * Creating a meeting from a template. Everything the template carries is
 * copied onto real rows server-side in one transaction — roles become
 * `proposed` `MeetingRoleAssignment`s. The caller still supplies date/time
 * and may override the meeting number, exactly like the legacy
 * "Create & Build" dialog.
 */
export const createMeetingFromTemplateRequestSchema = z
  .object({
    templateId: z.uuid(),
    programYearId: z.string().min(1),
    scheduledAt: z.iso.datetime(),
    meetingNumber: z.number().int().positive().optional(),
    theme: z.string().min(1).max(200).optional(),
  })
  .strict();
export type CreateMeetingFromTemplateRequest = z.infer<
  typeof createMeetingFromTemplateRequestSchema
>;
