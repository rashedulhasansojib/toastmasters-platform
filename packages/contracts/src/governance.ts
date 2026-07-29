import { z } from 'zod';

/**
 * M6 Slice 2: system-design.md §13.4. DCP qualifying requirement, due 30
 * Sep. Renders against the nightly DcpProjection goal-by-goal — the
 * President's live planning artefact, not a September formality.
 */
export const clubSuccessPlanStatus = z.enum(['draft', 'submitted', 'revised']);
export type ClubSuccessPlanStatus = z.infer<typeof clubSuccessPlanStatus>;

export const clubSuccessPlanMilestone = z.object({
  by: z.iso.date(),
  description: z.string(),
  achievedAt: z.iso.date().nullable(),
});
export type ClubSuccessPlanMilestone = z.infer<typeof clubSuccessPlanMilestone>;

export const clubSuccessPlanGoalTarget = z.object({
  dcpGoalNumber: z.number().int().min(1).max(10),
  targetValue: z.number(),
  ownerRole: z.string(),
  strategy: z.string(),
  milestones: z.array(clubSuccessPlanMilestone).default([]),
});
export type ClubSuccessPlanGoalTarget = z.infer<typeof clubSuccessPlanGoalTarget>;

export const clubSuccessPlanContributor = z.object({
  personId: z.uuid(),
  role: z.string(),
  contributedAt: z.iso.datetime(),
});
export type ClubSuccessPlanContributor = z.infer<typeof clubSuccessPlanContributor>;

export const clubSuccessPlanReview = z.object({
  at: z.iso.datetime(),
  byPersonId: z.uuid(),
  note: z.string(),
});
export type ClubSuccessPlanReview = z.infer<typeof clubSuccessPlanReview>;

export const clubSuccessPlan = z.object({
  id: z.uuid(),
  clubUnitId: z.uuid(),
  programYearId: z.string(),
  goalTargets: z.array(clubSuccessPlanGoalTarget),
  membershipTarget: z.number().int(),
  strengths: z.string().nullable(),
  challenges: z.string().nullable(),
  contributors: z.array(clubSuccessPlanContributor),
  status: clubSuccessPlanStatus,
  submittedAt: z.iso.datetime().nullable(),
  submittedBy: z.uuid().nullable(),
  tiSubmissionConfirmedAt: z.iso.datetime().nullable(),
  reviews: z.array(clubSuccessPlanReview),
});
export type ClubSuccessPlan = z.infer<typeof clubSuccessPlan>;

export const createClubSuccessPlanRequestSchema = z
  .object({
    programYearId: z.string().min(1),
    goalTargets: z.array(clubSuccessPlanGoalTarget).default([]),
    membershipTarget: z.number().int().nonnegative(),
    strengths: z.string().min(1).optional(),
    challenges: z.string().min(1).optional(),
  })
  .strict();
export type CreateClubSuccessPlanRequest = z.infer<typeof createClubSuccessPlanRequestSchema>;

export const updateClubSuccessPlanRequestSchema = z
  .object({
    goalTargets: z.array(clubSuccessPlanGoalTarget).optional(),
    membershipTarget: z.number().int().nonnegative().optional(),
    strengths: z.string().min(1).optional(),
    challenges: z.string().min(1).optional(),
  })
  .strict();
export type UpdateClubSuccessPlanRequest = z.infer<typeof updateClubSuccessPlanRequestSchema>;

export const addClubSuccessPlanReviewRequestSchema = z.object({ note: z.string().min(1) }).strict();
export type AddClubSuccessPlanReviewRequest = z.infer<typeof addClubSuccessPlanReviewRequestSchema>;

/** M8 Slice 1: system-design.md §13.1, FR-GOV-1. */
export const excomAttendee = z.object({
  personId: z.uuid(),
  role: z.string(),
  present: z.boolean(),
  apologies: z.boolean(),
});
export type ExComAttendee = z.infer<typeof excomAttendee>;

export const excomAgendaItem = z.object({
  order: z.number().int(),
  title: z.string(),
  presenterPersonId: z.uuid().nullable(),
  notes: z.string(),
});
export type ExComAgendaItem = z.infer<typeof excomAgendaItem>;

export const excomMeetingStatus = z.enum(['scheduled', 'in_progress', 'minuted', 'approved']);
export type ExComMeetingStatus = z.infer<typeof excomMeetingStatus>;

export const excomMeeting = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  programYearId: z.string(),
  heldAt: z.iso.datetime(),
  location: z.string(),
  calledBy: z.uuid(),
  attendees: z.array(excomAttendee),
  quorumRule: z.string(),
  quorumMet: z.boolean(),
  agenda: z.array(excomAgendaItem),
  status: excomMeetingStatus,
  createdAt: z.iso.datetime(),
});
export type ExComMeeting = z.infer<typeof excomMeeting>;

export const createExComMeetingRequestSchema = z
  .object({
    programYearId: z.string().min(1),
    heldAt: z.iso.datetime(),
    location: z.string().min(1),
    quorumRule: z.string().min(1),
    agenda: z
      .array(excomAgendaItem.omit({ order: true }).extend({ order: z.number().int() }))
      .default([]),
  })
  .strict();
export type CreateExComMeetingRequest = z.infer<typeof createExComMeetingRequestSchema>;

export const updateExComMeetingRequestSchema = z
  .object({
    attendees: z.array(excomAttendee).optional(),
    agenda: z.array(excomAgendaItem).optional(),
    quorumMet: z.boolean().optional(),
  })
  .strict();
export type UpdateExComMeetingRequest = z.infer<typeof updateExComMeetingRequestSchema>;

export const setExComMeetingStatusRequestSchema = z.object({ status: excomMeetingStatus }).strict();
export type SetExComMeetingStatusRequest = z.infer<typeof setExComMeetingStatusRequestSchema>;

/**
 * M8 Slice 2: system-design.md §13.2, FR-GOV-2. `vote.record` names each
 * voter — attributable, the opposite of M3's anonymous award ballots.
 */
export const motionVoteMethod = z.enum(['voice', 'show_of_hands', 'ballot']);
export type MotionVoteMethod = z.infer<typeof motionVoteMethod>;

export const motionVoteChoice = z.enum(['for', 'against', 'abstain']);
export type MotionVoteChoice = z.infer<typeof motionVoteChoice>;

export const motionVote = z.object({
  method: motionVoteMethod,
  for: z.number().int(),
  against: z.number().int(),
  abstain: z.number().int(),
  record: z.array(z.object({ personId: z.uuid(), choice: motionVoteChoice })).nullable(),
});
export type MotionVote = z.infer<typeof motionVote>;

export const motionOutcome = z.enum(['carried', 'failed', 'withdrawn', 'tabled', 'no_second']);
export type MotionOutcome = z.infer<typeof motionOutcome>;

export const motion = z.object({
  id: z.uuid(),
  excomMeetingId: z.uuid(),
  seq: z.number().int(),
  text: z.string(),
  movedByPersonId: z.uuid(),
  secondedByPersonId: z.uuid().nullable(),
  discussion: z.string().nullable(),
  vote: motionVote.nullable(),
  outcome: motionOutcome,
  effectiveFrom: z.iso.date().nullable(),
  supersedesMotionId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type Motion = z.infer<typeof motion>;

export const createMotionRequestSchema = z
  .object({
    text: z.string().min(1),
    movedByPersonId: z.uuid(),
    secondedByPersonId: z.uuid().optional(),
    discussion: z.string().min(1).optional(),
  })
  .strict();
export type CreateMotionRequest = z.infer<typeof createMotionRequestSchema>;

/** Records the attributable vote and derives `outcome` — `for > against` with a second → carried; no second recorded → no_second. */
export const recordMotionVoteRequestSchema = z
  .object({
    method: motionVoteMethod,
    record: z.array(z.object({ personId: z.uuid(), choice: motionVoteChoice })),
    effectiveFrom: z.iso.date().optional(),
  })
  .strict();
export type RecordMotionVoteRequest = z.infer<typeof recordMotionVoteRequestSchema>;

/**
 * M8 Slice 3: system-design.md §13.3, FR-GOV-3/4/5. Approved at the
 * *following* meeting, then immutable. `visibility` has no default —
 * open decision 9 (CLAUDE.md §2) stays unresolved; every draft chooses
 * explicitly.
 */
export const minutesSourceKind = z.enum(['excom', 'club_meeting']);
export type MinutesSourceKind = z.infer<typeof minutesSourceKind>;

export const minutesVisibility = z.enum(['officers', 'members', 'public']);
export type MinutesVisibility = z.infer<typeof minutesVisibility>;

export const minutes = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  programYearId: z.string(),
  sourceKind: minutesSourceKind,
  excomMeetingId: z.uuid().nullable(),
  clubMeetingId: z.uuid().nullable(),
  draftedBy: z.uuid(),
  draftedAt: z.iso.datetime(),
  body: z.string(),
  approvedAt: z.iso.datetime().nullable(),
  approvedByPersonId: z.uuid().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  libraryItemId: z.uuid().nullable(),
  visibility: minutesVisibility,
  version: z.number().int(),
  supersedesId: z.uuid().nullable(),
});
export type Minutes = z.infer<typeof minutes>;

export const draftMinutesRequestSchema = z
  .object({ programYearId: z.string().min(1), visibility: minutesVisibility })
  .strict();
export type DraftMinutesRequest = z.infer<typeof draftMinutesRequestSchema>;

export const approveMinutesRequestSchema = z.object({}).strict();
export type ApproveMinutesRequest = z.infer<typeof approveMinutesRequestSchema>;

export const newMinutesVersionRequestSchema = z.object({ body: z.string().min(1) }).strict();
export type NewMinutesVersionRequest = z.infer<typeof newMinutesVersionRequestSchema>;
