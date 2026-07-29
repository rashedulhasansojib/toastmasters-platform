import { z } from 'zod';

/** M6 Slice 1: system-design.md §16.2. The Area Director's mandatory, measurable artefact. */
export const areaVisitRound = z.enum(['R1', 'R2']);
export type AreaVisitRound = z.infer<typeof areaVisitRound>;

export const areaVisitMode = z.enum(['in_person', 'online']);
export type AreaVisitMode = z.infer<typeof areaVisitMode>;

export const areaVisitReportStatus = z.enum(['draft', 'submitted']);
export type AreaVisitReportStatus = z.infer<typeof areaVisitReportStatus>;

export const momentOfTruthStandard = z.enum([
  'first_impressions',
  'membership_orientation',
  'fellowship_variety_communication',
  'program_planning_meeting_organization',
  'membership_strength',
  'achievement_recognition',
]);
export type MomentOfTruthStandard = z.infer<typeof momentOfTruthStandard>;

export const momentOfTruthRating = z.object({
  standard: momentOfTruthStandard,
  rating: z.number().int().min(1).max(5),
  observations: z.string(),
  recommendations: z.string(),
});
export type MomentOfTruthRating = z.infer<typeof momentOfTruthRating>;

export const areaVisitReport = z.object({
  id: z.uuid(),
  areaUnitId: z.uuid(),
  clubUnitId: z.uuid(),
  programYearId: z.string(),
  round: areaVisitRound,
  visitedAt: z.iso.date(),
  visitMode: areaVisitMode,
  byPersonId: z.uuid(),
  momentsOfTruth: z.array(momentOfTruthRating),
  clubGoalsDiscussed: z.string().nullable(),
  supportRequestedFromDistrict: z.string().nullable(),
  status: areaVisitReportStatus,
  submittedAt: z.iso.datetime().nullable(),
});
export type AreaVisitReport = z.infer<typeof areaVisitReport>;

export const createAreaVisitReportRequestSchema = z
  .object({
    areaUnitId: z.uuid(),
    programYearId: z.string().min(1),
    round: areaVisitRound,
    visitedAt: z.iso.date(),
    visitMode: areaVisitMode,
    momentsOfTruth: z.array(momentOfTruthRating).length(6),
    clubGoalsDiscussed: z.string().min(1).optional(),
    supportRequestedFromDistrict: z.string().min(1).optional(),
  })
  .strict();
export type CreateAreaVisitReportRequest = z.infer<typeof createAreaVisitReportRequestSchema>;

export const presidentContactMethod = z.enum(['call', 'message', 'meeting', 'email']);
export type PresidentContactMethod = z.infer<typeof presidentContactMethod>;

export const presidentContactLog = z.object({
  id: z.uuid(),
  areaUnitId: z.uuid(),
  clubUnitId: z.uuid(),
  programYearId: z.string(),
  month: z.string(),
  contactedAt: z.iso.datetime(),
  byPersonId: z.uuid(),
  method: presidentContactMethod,
  dcpDiscussed: z.boolean(),
  note: z.string().nullable(),
});
export type PresidentContactLog = z.infer<typeof presidentContactLog>;

export const createPresidentContactLogRequestSchema = z
  .object({
    areaUnitId: z.uuid(),
    programYearId: z.string().min(1),
    month: z.string().min(1),
    contactedAt: z.iso.datetime(),
    method: presidentContactMethod,
    dcpDiscussed: z.boolean(),
    note: z.string().min(1).optional(),
  })
  .strict();
export type CreatePresidentContactLogRequest = z.infer<
  typeof createPresidentContactLogRequestSchema
>;

/**
 * M6 Slice 3: system-design.md §16.3, FR-OVS-5. Read-only via the API — the
 * nightly worker job is the only writer. `dataSource: 'not_yet_tracked'`
 * marks goals whose data source doesn't exist until M7 (education levels)
 * or is unmodelled (officer training periods) — see the M6 plan doc's
 * scope-sequencing note. Always rendered with a "Projected" label, never
 * "official" (FR-TI-4).
 */
export const dcpGoalArea = z.enum(['education', 'membership', 'training', 'administration']);
export type DcpGoalArea = z.infer<typeof dcpGoalArea>;

export const dcpGoalTrace = z.object({
  goalNumber: z.number().int().min(1).max(10),
  area: dcpGoalArea,
  label: z.string(),
  achievedCount: z.number().int(),
  targetCount: z.number().int(),
  achieved: z.boolean(),
  dataSource: z.enum(['computed', 'not_yet_tracked']),
  contributingRecordIds: z.array(z.uuid()),
});
export type DcpGoalTrace = z.infer<typeof dcpGoalTrace>;

export const dcpProjectedLevel = z.enum([
  'none',
  'distinguished',
  'select_distinguished',
  'presidents_distinguished',
  'smedley_distinguished',
]);
export type DcpProjectedLevel = z.infer<typeof dcpProjectedLevel>;

export const dcpProjection = z.object({
  id: z.uuid(),
  clubUnitId: z.uuid(),
  programYearId: z.string(),
  goals: z.array(dcpGoalTrace),
  membershipQualifierMet: z.boolean(),
  clubSuccessPlanQualifierMet: z.boolean(),
  projectedLevel: dcpProjectedLevel,
  computedAt: z.iso.datetime(),
});
export type DcpProjection = z.infer<typeof dcpProjection>;

/**
 * M6 Slice 4: system-design.md §19.4. Club-level aggregate only — never
 * member detail (FR-OVS-3). Read-only via the API; the monthly worker job
 * is the only writer. `attendanceAvg` is nullable — no member-level
 * attendance fact exists anywhere in the schema yet (see the schema
 * comment on `ClubHealthSnapshot`).
 */
export const clubHealthSnapshot = z.object({
  id: z.uuid(),
  clubUnitId: z.uuid(),
  yearMonth: z.string(),
  meetingsHeld: z.number().int(),
  attendanceAvg: z.number().nullable(),
  memberCount: z.number().int(),
  guestCount: z.number().int(),
  rolesFilledPct: z.number(),
  speechesGiven: z.number().int(),
  computedAt: z.iso.datetime(),
});
export type ClubHealthSnapshot = z.infer<typeof clubHealthSnapshot>;

/**
 * M6 Slice 5: system-design.md §16.1, FR-OVS-1. Tag roles as well as
 * people so a ticket stays correctly addressed after the 1 July handover.
 */
export const ticketPartyKind = z.enum(['person', 'role', 'unit']);
export type TicketPartyKind = z.infer<typeof ticketPartyKind>;

export const ticketParty = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('person'), personId: z.uuid() }),
  z.object({ kind: z.literal('role'), role: z.string(), orgUnitId: z.uuid() }),
  z.object({ kind: z.literal('unit'), orgUnitId: z.uuid() }),
]);
export type TicketParty = z.infer<typeof ticketParty>;

export const ticketSeverity = z.enum(['low', 'medium', 'high']);
export type TicketSeverity = z.infer<typeof ticketSeverity>;

export const ticketStatus = z.enum(['open', 'active', 'resolved']);
export type TicketStatus = z.infer<typeof ticketStatus>;

export const ticket = z.object({
  id: z.uuid(),
  scopeUnitId: z.uuid(),
  title: z.string(),
  body: z.string(),
  severity: ticketSeverity,
  status: ticketStatus,
  createdByPersonId: z.uuid(),
  parties: z.array(ticketParty),
  resolvedBy: z.uuid().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  resolutionNote: z.string().nullable(),
  reopenedFromId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});
export type Ticket = z.infer<typeof ticket>;

export const ticketComment = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  byPersonId: z.uuid(),
  body: z.string(),
  at: z.iso.datetime(),
});
export type TicketComment = z.infer<typeof ticketComment>;

export const createTicketRequestSchema = z
  .object({
    scopeUnitId: z.uuid(),
    title: z.string().min(1),
    body: z.string().min(1),
    severity: ticketSeverity.default('medium'),
    parties: z.array(ticketParty).default([]),
  })
  .strict();
export type CreateTicketRequest = z.infer<typeof createTicketRequestSchema>;

export const createTicketCommentRequestSchema = z.object({ body: z.string().min(1) }).strict();
export type CreateTicketCommentRequest = z.infer<typeof createTicketCommentRequestSchema>;

export const resolveTicketRequestSchema = z.object({ note: z.string().min(1) }).strict();
export type ResolveTicketRequest = z.infer<typeof resolveTicketRequestSchema>;

/** M6 Slice 7: FR-OVS-6 — the Area dashboard leads with visit compliance (R1/R2 filed vs. the 75% threshold), not attendance. */
export const areaDashboardClubStatus = z.object({
  clubUnitId: z.uuid(),
  clubName: z.string(),
  r1Submitted: z.boolean(),
  r2Submitted: z.boolean(),
});
export type AreaDashboardClubStatus = z.infer<typeof areaDashboardClubStatus>;

export const areaDashboardResponse = z.object({
  clubs: z.array(areaDashboardClubStatus),
  totalClubs: z.number().int(),
  r1CompliancePct: z.number(),
  r2CompliancePct: z.number(),
});
export type AreaDashboardResponse = z.infer<typeof areaDashboardResponse>;

/** M8 Slice 4: same shape as areaDashboardResponse, one tier up — aggregates are per-area, never per-club (FR-OVS-3). */
export const divisionDashboardAreaStatus = z.object({
  areaUnitId: z.uuid(),
  areaName: z.string(),
  totalClubs: z.number().int(),
  r1CompliancePct: z.number(),
  r2CompliancePct: z.number(),
});
export type DivisionDashboardAreaStatus = z.infer<typeof divisionDashboardAreaStatus>;

export const divisionDashboardResponse = z.object({
  areas: z.array(divisionDashboardAreaStatus),
});
export type DivisionDashboardResponse = z.infer<typeof divisionDashboardResponse>;
