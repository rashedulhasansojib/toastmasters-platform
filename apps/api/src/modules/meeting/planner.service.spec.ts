import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlannerService } from './planner.service';
import type { PlannerRepository } from './planner.repository';
import type { ProgramYearRepository } from '../identity/program-year.repository';

const RAHIM_A = '11111111-1111-1111-1111-111111111111';
const RAHIM_B = '22222222-2222-2222-2222-222222222222';
const AISYAH = '33333333-3333-3333-3333-333333333333';
const ACTOR = '99999999-9999-9999-9999-999999999999';
const CLUB = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MEETING = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function build(
  overrides: Partial<Record<keyof PlannerRepository, unknown>> = {},
  currentProgramYear: { id: string } | null = { id: '2026-2027' },
) {
  const created: unknown[] = [];
  const planner = {
    candidates: vi.fn().mockResolvedValue([
      { personId: AISYAH, fullName: 'Nur Aisyah Rahman' },
      { personId: RAHIM_A, fullName: 'Rahim Khan' },
    ]),
    findByScheduledAt: vi.fn().mockResolvedValue(new Map()),
    createMeeting: vi.fn().mockResolvedValue({ id: MEETING }),
    setMeetingTheme: vi.fn().mockResolvedValue(undefined),
    existingSlots: vi.fn().mockResolvedValue(new Set()),
    createAssignments: vi.fn().mockImplementation((rows: unknown[]) => {
      created.push(...rows);
      return Promise.resolve(rows.length);
    }),
    grid: vi.fn(),
    ...overrides,
  } as unknown as PlannerRepository;

  const programYears = {
    findCurrent: vi.fn().mockResolvedValue(currentProgramYear),
  } as unknown as ProgramYearRepository;

  return { service: new PlannerService(planner, programYears), planner, created };
}

const row = (cells: Array<{ roleKey: string; slotIndex?: number; name: string }>) => ({
  scheduledAt: '2026-09-01T11:00:00.000Z',
  cells,
});

describe('PlannerService.import — name resolution (FR-MTG-5)', () => {
  let harness: ReturnType<typeof build>;

  beforeEach(() => {
    harness = build();
  });

  it('resolves a matching member to their person id', async () => {
    const result = await harness.service.import(
      CLUB,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { rows: [row([{ roleKey: 'timer', name: 'Rahim Khan' }])] } as any,
      ACTOR,
    );

    expect(result.unresolved).toEqual([]);
    expect(result.assignmentsCreated).toBe(1);
    expect(harness.created[0]).toMatchObject({ personId: RAHIM_A, roleKey: 'timer' });
  });

  it('matches case, extra whitespace and punctuation differences', async () => {
    const result = await harness.service.import(
      CLUB,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { rows: [row([{ roleKey: 'timer', name: '  nur   aisyah rahman ' }])] } as any,
      ACTOR,
    );

    expect(result.unresolved).toEqual([]);
    expect(harness.created[0]).toMatchObject({ personId: AISYAH });
  });

  it('reports an unknown name instead of inventing an assignee', async () => {
    const result = await harness.service.import(
      CLUB,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { rows: [row([{ roleKey: 'timer', name: 'Nobody At All' }])] } as any,
      ACTOR,
    );

    expect(result.assignmentsCreated).toBe(0);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]).toMatchObject({ name: 'Nobody At All', reason: 'no_match' });
  });

  /** §9.2's stated reason for storing person ids: "a name string cannot distinguish three members called Rahim". */
  it('refuses to guess when two members share a name', async () => {
    const ambiguous = build({
      candidates: vi.fn().mockResolvedValue([
        { personId: RAHIM_A, fullName: 'Rahim Khan' },
        { personId: RAHIM_B, fullName: 'Rahim Khan' },
      ]),
    });

    const result = await ambiguous.service.import(
      CLUB,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { rows: [row([{ roleKey: 'timer', name: 'Rahim Khan' }])] } as any,
      ACTOR,
    );

    expect(result.assignmentsCreated).toBe(0);
    expect(result.unresolved[0]).toMatchObject({ reason: 'ambiguous' });
    expect(ambiguous.created).toEqual([]);
  });

  it('commits the rows it can resolve even when others fail', async () => {
    const result = await harness.service.import(
      CLUB,
      {
        rows: [
          row([
            { roleKey: 'timer', name: 'Rahim Khan' },
            { roleKey: 'grammarian', name: 'Ghost Member' },
          ]),
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      ACTOR,
    );

    expect(result.assignmentsCreated).toBe(1);
    expect(result.unresolved).toHaveLength(1);
  });

  it('never overwrites a slot that is already filled', async () => {
    const filled = build({
      existingSlots: vi.fn().mockResolvedValue(new Set([`${MEETING}:timer:null`])),
    });

    const result = await filled.service.import(
      CLUB,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { rows: [row([{ roleKey: 'timer', name: 'Rahim Khan' }])] } as any,
      ACTOR,
    );

    expect(result.assignmentsCreated).toBe(0);
    expect(result.assignmentsSkipped).toBe(1);
    expect(filled.created).toEqual([]);
  });

  it('schedules a meeting for a date with none, and reuses it for a second row on that date', async () => {
    const result = await harness.service.import(
      CLUB,
      {
        rows: [
          row([{ roleKey: 'timer', name: 'Rahim Khan' }]),
          row([{ roleKey: 'grammarian', name: 'Nur Aisyah Rahman' }]),
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      ACTOR,
    );

    expect(result.meetingsCreated).toBe(1);
    expect(result.meetingsMatched).toBe(1);
    expect(harness.planner.createMeeting).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when there is no current program year', async () => {
    const noYear = build({}, null);

    await expect(
      noYear.service.import(
        CLUB,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { rows: [row([{ roleKey: 'timer', name: 'Rahim Khan' }])] } as any,
        ACTOR,
      ),
    ).rejects.toThrow(/program year/i);
  });
});
