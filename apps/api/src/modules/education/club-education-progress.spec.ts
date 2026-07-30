import { describe, expect, it } from 'vitest';
import type { EducationRecordLevel } from '@toastmasters/contracts';
import { buildClubEducationProgress } from './club-education-progress';

const ANA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const SLOT1 = '44444444-4444-4444-8444-444444444444';
const SLOT2 = '55555555-5555-4555-8555-555555555555';
const APPROVAL1 = '66666666-6666-4666-8666-666666666666';
const APPROVAL2 = '77777777-7777-4777-8777-777777777777';

function level(overrides: Partial<EducationRecordLevel> & { level: number }): EducationRecordLevel {
  return {
    projectsDelivered: [],
    educationSeriesPresentation: null,
    memberMarkedCompleteAt: null,
    vpeConfirmedAt: null,
    vpeConfirmedBy: null,
    tiAwardRecordedAt: null,
    provenance: 'portal',
    backfilledAt: null,
    ...overrides,
  };
}

const projects = [
  { pathCode: 'PM', projectCode: 'PM-ICE-BREAKER', level: 1 },
  { pathCode: 'PM', projectCode: 'PM-EVAL-FEEDBACK', level: 1 },
];

describe('buildClubEducationProgress', () => {
  it('counts distinct delivered projects against the seeded catalogue', () => {
    const rows = buildClubEducationProgress({
      members: [{ personId: ANA, fullName: 'Ana Rahman' }],
      records: [
        {
          id: RECORD,
          personId: ANA,
          pathCode: 'PM',
          pathName: 'Presentation Mastery',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          completedAt: null,
          credential: null,
          levels: [level({ level: 1, memberMarkedCompleteAt: '2026-02-01T00:00:00.000Z' })],
        },
      ],
      projects,
      // The Ice Breaker twice — a re-delivery must not count as progress,
      // and the drawer must show the earliest speech (the one that first
      // satisfied the project), not the practice re-run.
      deliveries: [
        {
          personId: ANA,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          speechTitle: 'Hello, Toastmasters',
          deliveredAt: new Date('2026-01-15T00:00:00.000Z'),
          speechSlotId: SLOT1,
        },
        {
          personId: ANA,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          speechTitle: 'Hello again',
          deliveredAt: new Date('2026-03-01T00:00:00.000Z'),
          speechSlotId: SLOT2,
        },
      ],
      approvals: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.pathName).toBe('Presentation Mastery');
    // No SpeechApproval row on file: grandfathered as delivered — a delivery
    // that predates the M11 workflow still counts, otherwise turning the
    // workflow on would retroactively zero out historical progress.
    expect(rows[0]?.levels[0]).toMatchObject({
      level: 1,
      required: 2,
      delivered: 1,
      pending: 0,
    });
    // Levels the catalogue does not define yet report required 0, so the UI
    // can say "not defined" rather than implying the member did nothing.
    expect(rows[0]?.levels[1]).toMatchObject({ level: 2, required: 0, delivered: 0, pending: 0 });
    expect(rows[0]?.levels).toHaveLength(5);
    expect(rows[0]?.pendingApprovalCount).toBe(0);
    expect(rows[0]?.deliveredProjects).toEqual([
      {
        projectCode: 'PM-ICE-BREAKER',
        speechTitle: 'Hello, Toastmasters',
        deliveredAt: '2026-01-15T00:00:00.000Z',
        approvalId: null,
        approvalStatus: null,
        approvedAt: null,
      },
    ]);
  });

  it('keeps a member with no education record on the roster', () => {
    const rows = buildClubEducationProgress({
      members: [{ personId: BEN, fullName: 'Ben Osei' }],
      records: [],
      projects,
      deliveries: [],
      approvals: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fullName: 'Ben Osei', recordId: null, pathCode: null });
    expect(rows[0]?.levels.every((l) => l.required === 0 && l.delivered === 0)).toBe(true);
    expect(rows[0]?.deliveredProjects).toEqual([]);
  });

  it("does not credit another member's delivery", () => {
    const rows = buildClubEducationProgress({
      members: [{ personId: ANA, fullName: 'Ana Rahman' }],
      records: [
        {
          id: RECORD,
          personId: ANA,
          pathCode: 'PM',
          pathName: 'Presentation Mastery',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          completedAt: null,
          credential: null,
          levels: [],
        },
      ],
      projects,
      deliveries: [
        {
          personId: BEN,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          speechTitle: "Ben's Ice Breaker",
          deliveredAt: new Date('2026-01-15T00:00:00.000Z'),
          speechSlotId: SLOT1,
        },
      ],
      approvals: [],
    });

    expect(rows[0]?.levels[0]).toMatchObject({ required: 2, delivered: 0, pending: 0 });
    expect(rows[0]?.pendingApprovalCount).toBe(0);
    expect(rows[0]?.deliveredProjects).toEqual([]);
  });

  it('carries the approval status and approvedAt onto the delivery row', () => {
    // M11 Slice 2: the drawer needs to render Pending / Approved / Denied
    // pills, so buildClubEducationProgress must fold the approval row onto
    // the delivery. The join key is the speech slot id — one-to-one.
    const rows = buildClubEducationProgress({
      members: [{ personId: ANA, fullName: 'Ana Rahman' }],
      records: [
        {
          id: RECORD,
          personId: ANA,
          pathCode: 'PM',
          pathName: 'Presentation Mastery',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          completedAt: null,
          credential: null,
          levels: [],
        },
      ],
      projects,
      deliveries: [
        {
          personId: ANA,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          speechTitle: 'Hello, Toastmasters',
          deliveredAt: new Date('2026-01-15T00:00:00.000Z'),
          speechSlotId: SLOT1,
        },
      ],
      approvals: [
        {
          id: APPROVAL1,
          speechSlotId: SLOT1,
          status: 'approved',
          approvedAt: new Date('2026-01-20T00:00:00.000Z'),
        },
      ],
    });

    expect(rows[0]?.deliveredProjects[0]).toMatchObject({
      approvalId: APPROVAL1,
      approvalStatus: 'approved',
      approvedAt: '2026-01-20T00:00:00.000Z',
    });
  });

  it('counts a requested approval as pending, not delivered — and rolls it up on pendingApprovalCount', () => {
    // M11 Slice 3: a delivery whose approval is still awaiting the VPE moves
    // `pending`, never `delivered`. The bell badge on the roster reads from
    // `pendingApprovalCount`, so it must roll up here rather than force the
    // dashboard to re-count from `deliveredProjects` on every render.
    const rows = buildClubEducationProgress({
      members: [{ personId: ANA, fullName: 'Ana Rahman' }],
      records: [
        {
          id: RECORD,
          personId: ANA,
          pathCode: 'PM',
          pathName: 'Presentation Mastery',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          completedAt: null,
          credential: null,
          levels: [],
        },
      ],
      projects,
      deliveries: [
        {
          personId: ANA,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          speechTitle: 'Hello',
          deliveredAt: new Date('2026-01-15T00:00:00.000Z'),
          speechSlotId: SLOT1,
        },
      ],
      approvals: [{ id: APPROVAL1, speechSlotId: SLOT1, status: 'requested', approvedAt: null }],
    });

    expect(rows[0]?.levels[0]).toMatchObject({ required: 2, delivered: 0, pending: 1 });
    expect(rows[0]?.pendingApprovalCount).toBe(1);
  });

  it('counts a denied approval as neither delivered nor pending', () => {
    // A denied speech is not progress — it neither moves the counter nor
    // demands VPE action. The drawer will still render the "Denied" pill on
    // the delivery row, but nothing rolls up.
    const rows = buildClubEducationProgress({
      members: [{ personId: ANA, fullName: 'Ana Rahman' }],
      records: [
        {
          id: RECORD,
          personId: ANA,
          pathCode: 'PM',
          pathName: 'Presentation Mastery',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          completedAt: null,
          credential: null,
          levels: [],
        },
      ],
      projects,
      deliveries: [
        {
          personId: ANA,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          speechTitle: 'Hello',
          deliveredAt: new Date('2026-01-15T00:00:00.000Z'),
          speechSlotId: SLOT1,
        },
      ],
      approvals: [{ id: APPROVAL1, speechSlotId: SLOT1, status: 'denied', approvedAt: null }],
    });

    expect(rows[0]?.levels[0]).toMatchObject({ required: 2, delivered: 0, pending: 0 });
    expect(rows[0]?.pendingApprovalCount).toBe(0);
  });

  it('rolls pendingApprovalCount up across levels', () => {
    // Two deliveries on the same path at different levels, both pending.
    // The badge counts both — otherwise a VPE sees "1 pending" when there
    // are really two speeches waiting.
    const rows = buildClubEducationProgress({
      members: [{ personId: ANA, fullName: 'Ana Rahman' }],
      records: [
        {
          id: RECORD,
          personId: ANA,
          pathCode: 'PM',
          pathName: 'Presentation Mastery',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          completedAt: null,
          credential: null,
          levels: [],
        },
      ],
      projects: [
        { pathCode: 'PM', projectCode: 'PM-ICE-BREAKER', level: 1 },
        { pathCode: 'PM', projectCode: 'PM-L2-FIRST', level: 2 },
      ],
      deliveries: [
        {
          personId: ANA,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          speechTitle: 'L1',
          deliveredAt: new Date('2026-01-15T00:00:00.000Z'),
          speechSlotId: SLOT1,
        },
        {
          personId: ANA,
          pathCode: 'PM',
          projectCode: 'PM-L2-FIRST',
          speechTitle: 'L2',
          deliveredAt: new Date('2026-02-15T00:00:00.000Z'),
          speechSlotId: SLOT2,
        },
      ],
      approvals: [
        { id: APPROVAL1, speechSlotId: SLOT1, status: 'requested', approvedAt: null },
        { id: APPROVAL2, speechSlotId: SLOT2, status: 'requested', approvedAt: null },
      ],
    });

    expect(rows[0]?.levels[0]).toMatchObject({ level: 1, pending: 1 });
    expect(rows[0]?.levels[1]).toMatchObject({ level: 2, pending: 1 });
    expect(rows[0]?.pendingApprovalCount).toBe(2);
  });

  it("leaves approval fields null when no SpeechApproval row exists for the delivery's slot", () => {
    // The pre-migration case: a closed meeting from before Slice 1 has no
    // approval row for its slots, so the drawer must render "no approval on
    // file" rather than a bare "Pending" pill it can never act on.
    const rows = buildClubEducationProgress({
      members: [{ personId: ANA, fullName: 'Ana Rahman' }],
      records: [
        {
          id: RECORD,
          personId: ANA,
          pathCode: 'PM',
          pathName: 'Presentation Mastery',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          completedAt: null,
          credential: null,
          levels: [],
        },
      ],
      projects,
      deliveries: [
        {
          personId: ANA,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          speechTitle: 'Hello',
          deliveredAt: new Date('2026-01-15T00:00:00.000Z'),
          speechSlotId: SLOT1,
        },
      ],
      approvals: [],
    });

    expect(rows[0]?.deliveredProjects[0]).toMatchObject({
      approvalId: null,
      approvalStatus: null,
      approvedAt: null,
    });
  });
});
