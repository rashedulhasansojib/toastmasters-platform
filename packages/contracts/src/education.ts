import { z } from 'zod';

/**
 * M7 Slice 1: system-design.md §10.1, FR-EDU-2/3. Two-step confirmation —
 * `memberMarkedCompleteAt` is gated on delivered `PathwayProject` rows
 * (never bare self-report), `vpeConfirmedAt` is VPE-only and is the only
 * date that feeds the DCP projection.
 */
export const educationRecordLevel = z.object({
  level: z.number().int().min(1).max(5),
  projectsDelivered: z.array(
    z.object({
      projectCode: z.string(),
      speechSlotId: z.uuid(),
      deliveredAt: z.iso.datetime(),
    }),
  ),
  educationSeriesPresentation: z.object({ title: z.string(), meetingId: z.uuid() }).nullable(),
  memberMarkedCompleteAt: z.iso.datetime().nullable(),
  vpeConfirmedAt: z.iso.datetime().nullable(),
  vpeConfirmedBy: z.uuid().nullable(),
  tiAwardRecordedAt: z.iso.datetime().nullable(),
  provenance: z.enum(['portal', 'ti']),
  /**
   * Set only when this level was bulk-marked complete because the record
   * started mid-path (a delivered speech landed on a higher level with no
   * prior levels on file) — never on a genuine member-mark -> VPE-confirm.
   * Distinguishes "completed elsewhere, not individually tracked" from a
   * level a VPE actually reviewed project-by-project, even though both set
   * `vpeConfirmedAt`.
   */
  backfilledAt: z.iso.datetime().nullable(),
});
export type EducationRecordLevel = z.infer<typeof educationRecordLevel>;

export const educationRecord = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  clubUnitId: z.uuid(),
  pathCode: z.string(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  credential: z.string().nullable(),
  levels: z.array(educationRecordLevel),
  createdAt: z.iso.datetime(),
});
export type EducationRecord = z.infer<typeof educationRecord>;

export const createEducationRecordRequestSchema = z
  .object({
    personId: z.uuid(),
    pathCode: z.string().min(1),
    /**
     * VPE-driven "start mid-path": levels below this one are bulk-marked
     * complete (see `educationRecordLevel.backfilledAt`) rather than left
     * to be individually delivered and confirmed. Omitted or `1` starts the
     * record with no levels touched — today's behaviour.
     */
    startingLevel: z.number().int().min(1).max(5).optional(),
  })
  .strict();
export type CreateEducationRecordRequest = z.infer<typeof createEducationRecordRequestSchema>;

/**
 * The member's most recently scheduled speech (delivered or not) — what a
 * VPE starting a path for them would naturally pre-fill. `null` when the
 * person has no `SpeechSlot` on record in the club at all.
 */
export const pathwaySuggestion = z
  .object({
    pathCode: z.string(),
    pathName: z.string(),
    projectCode: z.string(),
    level: z.number().int().min(1).max(5),
  })
  .nullable();
export type PathwaySuggestion = z.infer<typeof pathwaySuggestion>;

/** Member-initiated, but the service verifies the level's PathwayProject rows are actually delivered before accepting — never bare self-report. */
export const markLevelCompleteRequestSchema = z.object({}).strict();
export type MarkLevelCompleteRequest = z.infer<typeof markLevelCompleteRequestSchema>;

export const confirmLevelRequestSchema = z.object({}).strict();
export type ConfirmLevelRequest = z.infer<typeof confirmLevelRequestSchema>;

/**
 * M7 Slice 2: system-design.md §10.2, FR-EDU-4/5. `metricsSnapshot` is
 * copied at submission time — a later timer correction never rewrites it.
 */
export const evaluationSubjectKind = z.enum(['prepared_speech', 'table_topic']);
export type EvaluationSubjectKind = z.infer<typeof evaluationSubjectKind>;

export const evaluationMode = z.enum(['form', 'audio', 'scan']);
export type EvaluationMode = z.infer<typeof evaluationMode>;

export const evaluationVisibility = z.enum(['speaker_and_vpe', 'speaker_only']);
export type EvaluationVisibility = z.infer<typeof evaluationVisibility>;

export const evaluationFormScale = z.object({
  criterion: z.string(),
  value: z.number().int().min(1).max(5),
});
export type EvaluationFormScale = z.infer<typeof evaluationFormScale>;

export const evaluationMetricsSnapshot = z.object({
  timer: z.object({ elapsedMs: z.number().int(), signal: z.string() }).nullable(),
  ahCounter: z.array(z.object({ word: z.string(), count: z.number().int() })).nullable(),
});
export type EvaluationMetricsSnapshot = z.infer<typeof evaluationMetricsSnapshot>;

export const speechEvaluation = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  orgUnitId: z.uuid(),
  subjectKind: evaluationSubjectKind,
  speechSlotId: z.uuid().nullable(),
  speakerPersonId: z.uuid().nullable(),
  speakerGuestId: z.uuid().nullable(),
  evaluatorPersonId: z.uuid(),
  mode: evaluationMode,
  formScales: z.array(evaluationFormScale).nullable(),
  formExcelledAt: z.string().nullable(),
  formWorkOn: z.string().nullable(),
  formChallengeYourself: z.string().nullable(),
  audioUrl: z.string().nullable(),
  scanUrl: z.string().nullable(),
  metricsSnapshot: evaluationMetricsSnapshot,
  visibility: evaluationVisibility,
  submittedAt: z.iso.datetime(),
});
export type SpeechEvaluation = z.infer<typeof speechEvaluation>;

export const createSpeechEvaluationRequestSchema = z
  .object({
    meetingId: z.uuid(),
    subjectKind: evaluationSubjectKind,
    speechSlotId: z.uuid().optional(),
    speakerPersonId: z.uuid().optional(),
    speakerGuestId: z.uuid().optional(),
    mode: evaluationMode,
    formScales: z.array(evaluationFormScale).optional(),
    formExcelledAt: z.string().min(1).optional(),
    formWorkOn: z.string().min(1).optional(),
    formChallengeYourself: z.string().min(1).optional(),
    audioUrl: z.string().min(1).optional(),
    scanUrl: z.string().min(1).optional(),
    visibility: evaluationVisibility.default('speaker_and_vpe'),
  })
  .strict();
export type CreateSpeechEvaluationRequest = z.infer<typeof createSpeechEvaluationRequestSchema>;

/**
 * M7 Slice 3: system-design.md §10.3, FR-EDU-6. Ranked suggestions, never
 * automatic pairing.
 */
export const mentorshipPurpose = z.enum([
  'new_member_onboarding',
  'pathway_project',
  'contest_prep',
  'officer_transition',
  'general',
]);
export type MentorshipPurpose = z.infer<typeof mentorshipPurpose>;

export const mentorshipStatus = z.enum(['proposed', 'active', 'completed', 'ended']);
export type MentorshipStatus = z.infer<typeof mentorshipStatus>;

export const mentorshipEndedReason = z.enum([
  'completed',
  'mentor_unavailable',
  'mentee_left',
  'mismatch',
]);
export type MentorshipEndedReason = z.infer<typeof mentorshipEndedReason>;

export const mentorshipGoal = z.object({
  text: z.string(),
  targetDate: z.iso.date().nullable(),
  completedAt: z.iso.date().nullable(),
});
export type MentorshipGoal = z.infer<typeof mentorshipGoal>;

export const mentorshipCheckIn = z.object({
  at: z.iso.datetime(),
  byPersonId: z.uuid(),
  note: z.string(),
  nextDueOn: z.iso.date().nullable(),
});
export type MentorshipCheckIn = z.infer<typeof mentorshipCheckIn>;

export const mentorshipPairing = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  programYearId: z.string(),
  mentorPersonId: z.uuid(),
  menteePersonId: z.uuid(),
  purpose: mentorshipPurpose,
  status: mentorshipStatus,
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  endedReason: mentorshipEndedReason.nullable(),
  assignedBy: z.uuid(),
  goals: z.array(mentorshipGoal),
  checkIns: z.array(mentorshipCheckIn),
});
export type MentorshipPairing = z.infer<typeof mentorshipPairing>;

export const createMentorshipPairingRequestSchema = z
  .object({
    programYearId: z.string().min(1),
    mentorPersonId: z.uuid(),
    menteePersonId: z.uuid(),
    purpose: mentorshipPurpose,
  })
  .strict();
export type CreateMentorshipPairingRequest = z.infer<typeof createMentorshipPairingRequestSchema>;

export const addMentorshipCheckInRequestSchema = z
  .object({ note: z.string().min(1), nextDueOn: z.iso.date().optional() })
  .strict();
export type AddMentorshipCheckInRequest = z.infer<typeof addMentorshipCheckInRequestSchema>;

export const endMentorshipPairingRequestSchema = z
  .object({ reason: mentorshipEndedReason })
  .strict();
export type EndMentorshipPairingRequest = z.infer<typeof endMentorshipPairingRequestSchema>;

export const mentorAvailability = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  orgUnitId: z.uuid(),
  isAvailable: z.boolean(),
  maxConcurrentMentees: z.number().int(),
  strengths: z.array(z.string()),
  preferredPurposes: z.array(mentorshipPurpose),
});
export type MentorAvailability = z.infer<typeof mentorAvailability>;

export const setMentorAvailabilityRequestSchema = z
  .object({
    isAvailable: z.boolean().default(true),
    maxConcurrentMentees: z.number().int().positive().default(2),
    strengths: z.array(z.string()).default([]),
    preferredPurposes: z.array(mentorshipPurpose).default([]),
  })
  .strict();
export type SetMentorAvailabilityRequest = z.infer<typeof setMentorAvailabilityRequestSchema>;

export const mentorshipSuggestion = z.object({
  mentorPersonId: z.uuid(),
  score: z.number(),
  reasons: z.array(z.string()),
});
export type MentorshipSuggestion = z.infer<typeof mentorshipSuggestion>;

/**
 * M7 Slice 4: system-design.md §10.4, FR-EDU-7. Must exist before the
 * first July. `orgUnitId: null` means district-wide default.
 */
export const onboardingAudience = z.enum(['new_member', 'new_officer', 'guest', 'mentor']);
export type OnboardingAudience = z.infer<typeof onboardingAudience>;

export const onboardingStepType = z.enum(['read', 'watch', 'do', 'acknowledge', 'meet']);
export type OnboardingStepType = z.infer<typeof onboardingStepType>;

export const onboardingStep = z.object({
  key: z.string(),
  order: z.number().int(),
  title: z.string(),
  type: onboardingStepType,
  body: z.string().nullable(),
  libraryItemId: z.uuid().nullable(),
  dueWithinDays: z.number().int().nullable(),
  isRequired: z.boolean(),
});
export type OnboardingStep = z.infer<typeof onboardingStep>;

export const onboardingTrack = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid().nullable(),
  name: z.string(),
  audience: onboardingAudience,
  forRoles: z.array(z.string()),
  isActive: z.boolean(),
  steps: z.array(onboardingStep),
  createdAt: z.iso.datetime(),
});
export type OnboardingTrack = z.infer<typeof onboardingTrack>;

export const createOnboardingTrackRequestSchema = z
  .object({
    name: z.string().min(1),
    audience: onboardingAudience,
    forRoles: z.array(z.string()).default([]),
    steps: z.array(onboardingStep.omit({ key: true }).extend({ key: z.string().min(1) })),
  })
  .strict();
export type CreateOnboardingTrackRequest = z.infer<typeof createOnboardingTrackRequestSchema>;

export const onboardingProgressStep = z.object({
  key: z.string(),
  completedAt: z.iso.datetime().nullable(),
  note: z.string().nullable(),
});
export type OnboardingProgressStep = z.infer<typeof onboardingProgressStep>;

export const onboardingProgress = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  trackId: z.uuid(),
  orgUnitId: z.uuid(),
  enrolledAt: z.iso.datetime(),
  steps: z.array(onboardingProgressStep),
  completedAt: z.iso.datetime().nullable(),
  nudgedAt: z.iso.datetime().nullable(),
});
export type OnboardingProgress = z.infer<typeof onboardingProgress>;

/** Explicit officer-initiated enrolment — see the M7 plan doc's scope-cut note on automatic triggers. */
export const enrollOnboardingRequestSchema = z
  .object({ personId: z.uuid(), trackId: z.uuid() })
  .strict();
export type EnrollOnboardingRequest = z.infer<typeof enrollOnboardingRequestSchema>;

export const completeOnboardingStepRequestSchema = z
  .object({ note: z.string().min(1).optional() })
  .strict();
export type CompleteOnboardingStepRequest = z.infer<typeof completeOnboardingStepRequestSchema>;

/**
 * M10: the club's education roster — one row per member per path, with
 * per-level progress. A read-only **projection**, not a record: `delivered`
 * is counted live from approved speech slots on closed meetings (the same
 * evidence `markLevelComplete` gates on), and `required` comes from the
 * seeded `PathwayProject` catalogue, so both move when the catalogue does.
 *
 * `required: 0` means the catalogue has no projects seeded at that level for
 * that path — the UI must render that as "not defined", never as "0 of 0
 * complete", or a thin catalogue reads as a member who has done nothing.
 */
export const clubEducationProgressLevel = z.object({
  level: z.number().int().min(1).max(5),
  /** Projects the seeded catalogue defines at this level of this path. */
  required: z.number().int().min(0),
  /**
   * Distinct catalogue projects that have been delivered AND cleared the VPE
   * approval workflow (`SpeechApproval.status = 'approved'`). Pre-workflow
   * deliveries whose slot has no `SpeechApproval` row on file are grandfathered
   * in — they still count. M11 Slice 3 tightens this: a delivered-but-pending
   * (or denied) project no longer moves the counter. See `pending` below for
   * the queue the VPE needs to work on.
   */
  delivered: z.number().int().min(0),
  /**
   * Distinct catalogue projects delivered at this level whose `SpeechApproval`
   * is still `requested`. Level headers use this to render the amber "N pending
   * VPE approval" tint. Never included in `delivered` — that would present a
   * projection as if the VPE had already blessed it.
   */
  pending: z.number().int().min(0),
  memberMarkedCompleteAt: z.iso.datetime().nullable(),
  /** The only date that ever feeds the DCP projection (FR-EDU-3). */
  vpeConfirmedAt: z.iso.datetime().nullable(),
  /**
   * M12: set when this level was bulk-marked complete on a mid-path start
   * rather than delivered and individually reviewed — see
   * `EducationRecordLevel.backfilledAt`. The roster renders this distinctly
   * from a level the VPE actually confirmed project-by-project.
   */
  backfilledAt: z.iso.datetime().nullable(),
});
export type ClubEducationProgressLevel = z.infer<typeof clubEducationProgressLevel>;

/**
 * M11 Slice 1: VPE education-credit approval for a delivered speech.
 *
 * Auto-requested on meeting close for every approved SpeechSlot with a
 * resolvable speaker (see the auto-create hook in the meeting lifecycle).
 * Never hand-created; VPE transitions this row from `requested` to either
 * `approved` or `denied` via the Slice 2 endpoints — no other paths.
 */
export const speechApprovalStatus = z.enum(['requested', 'approved', 'denied']);
export type SpeechApprovalStatus = z.infer<typeof speechApprovalStatus>;

export const speechApproval = z.object({
  id: z.uuid(),
  speechSlotId: z.uuid(),
  personId: z.uuid(),
  clubUnitId: z.uuid(),
  pathCode: z.string(),
  projectCode: z.string(),
  level: z.number().int().min(1).max(5),
  status: speechApprovalStatus,
  /** When the meeting closed — the same instant `SpeechEvaluation.submittedAt` sits near. */
  requestedAt: z.iso.datetime(),
  approvedAt: z.iso.datetime().nullable(),
  approvedBy: z.uuid().nullable(),
  deniedAt: z.iso.datetime().nullable(),
  deniedBy: z.uuid().nullable(),
  denialReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type SpeechApproval = z.infer<typeof speechApproval>;

/**
 * M11 Slice 2: filter the club's approvals list. Omitted returns every
 * status — the drawer wants that, the notification bell (Slice 3) will
 * pass `requested` to count pending only.
 */
export const listSpeechApprovalsQuerySchema = z
  .object({ status: speechApprovalStatus.optional() })
  .strict();
export type ListSpeechApprovalsQuery = z.infer<typeof listSpeechApprovalsQuerySchema>;

/** No body — the VPE clicks Approve; the decision is the endpoint. */
export const approveSpeechApprovalRequestSchema = z.object({}).strict();
export type ApproveSpeechApprovalRequest = z.infer<typeof approveSpeechApprovalRequestSchema>;

/**
 * A denial must state why — the reason is the audit trail. Never optional;
 * an empty string is not a reason.
 */
export const denySpeechApprovalRequestSchema = z.object({ reason: z.string().min(1) }).strict();
export type DenySpeechApprovalRequest = z.infer<typeof denySpeechApprovalRequestSchema>;

/**
 * A catalogue project the member has actually delivered on this path — the
 * earliest approved slot on a closed meeting. Re-deliveries do not appear:
 * the drawer shows the speech that first satisfied the project, not every
 * time the Ice Breaker got repeated for practice.
 */
export const clubEducationProgressDelivery = z.object({
  projectCode: z.string(),
  speechTitle: z.string(),
  deliveredAt: z.iso.datetime(),
  /**
   * M11 Slice 2: which auto-approval row this delivery corresponds to, and
   * where it sits in the VPE review flow. All three are null when the
   * delivery predates Slice 1's auto-request hook (a closed meeting from
   * before the migration ran) — the UI reads that as "no approval on file",
   * not as pending.
   */
  approvalId: z.uuid().nullable(),
  approvalStatus: speechApprovalStatus.nullable(),
  approvedAt: z.iso.datetime().nullable(),
});
export type ClubEducationProgressDelivery = z.infer<typeof clubEducationProgressDelivery>;

export const clubEducationProgressRow = z.object({
  personId: z.uuid(),
  fullName: z.string(),
  /** null when the member has not started a path — the row still appears. */
  recordId: z.uuid().nullable(),
  pathCode: z.string().nullable(),
  pathName: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  credential: z.string().nullable(),
  levels: z.array(clubEducationProgressLevel),
  /** Per-project delivery detail for this row's path. Empty until a member both starts a path and delivers a project on it. */
  deliveredProjects: z.array(clubEducationProgressDelivery),
  /**
   * M11 Slice 3: number of deliveries on this row whose `SpeechApproval` is
   * still `requested`. Drives the bell badge on the pinned name column — a
   * VPE at a glance sees which members have work waiting on them. Never
   * exposed on rows outside the caller's own club (the roster endpoint
   * already gates that at `education.progress:read`).
   */
  pendingApprovalCount: z.number().int().min(0),
});
export type ClubEducationProgressRow = z.infer<typeof clubEducationProgressRow>;
