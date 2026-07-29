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
