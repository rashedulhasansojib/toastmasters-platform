import { describe, expect, it } from 'vitest';
import type { EducationRecordLevel } from '@toastmasters/contracts';
import { buildClubEducationProgress } from './club-education-progress';

const ANA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';

function level(overrides: Partial<EducationRecordLevel> & { level: number }): EducationRecordLevel {
  return {
    projectsDelivered: [],
    educationSeriesPresentation: null,
    memberMarkedCompleteAt: null,
    vpeConfirmedAt: null,
    vpeConfirmedBy: null,
    tiAwardRecordedAt: null,
    provenance: 'portal',
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
        },
        {
          personId: ANA,
          pathCode: 'PM',
          projectCode: 'PM-ICE-BREAKER',
          speechTitle: 'Hello again',
          deliveredAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.pathName).toBe('Presentation Mastery');
    expect(rows[0]?.levels[0]).toMatchObject({ level: 1, required: 2, delivered: 1 });
    // Levels the catalogue does not define yet report required 0, so the UI
    // can say "not defined" rather than implying the member did nothing.
    expect(rows[0]?.levels[1]).toMatchObject({ level: 2, required: 0, delivered: 0 });
    expect(rows[0]?.levels).toHaveLength(5);
    expect(rows[0]?.deliveredProjects).toEqual([
      {
        projectCode: 'PM-ICE-BREAKER',
        speechTitle: 'Hello, Toastmasters',
        deliveredAt: '2026-01-15T00:00:00.000Z',
      },
    ]);
  });

  it('keeps a member with no education record on the roster', () => {
    const rows = buildClubEducationProgress({
      members: [{ personId: BEN, fullName: 'Ben Osei' }],
      records: [],
      projects,
      deliveries: [],
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
        },
      ],
    });

    expect(rows[0]?.levels[0]).toMatchObject({ required: 2, delivered: 0 });
    expect(rows[0]?.deliveredProjects).toEqual([]);
  });
});
