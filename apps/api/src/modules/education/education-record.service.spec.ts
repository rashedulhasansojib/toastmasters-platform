import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EducationRecordService } from './education-record.service';
import type { EducationRecordRepository, SlotApproval } from './education-record.repository';

/**
 * M11 Slice 3: the tightening on `markLevelComplete` and `confirmLevel`.
 *
 * The service now refuses either transition when any catalogue project's
 * `SpeechApproval` is `requested` or `denied` — a delivered-but-pending
 * speech is not evidence a level is done. The DCP projection reads
 * `vpeConfirmedAt`, so a stale confirm here would land as if TI had
 * awarded it.
 *
 * Repo is stubbed rather than mocked so a signature drift on
 * EducationRecordRepository breaks this test — it's the shape that matters,
 * not the individual call counts.
 */

const RECORD_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const PERSON = 'aaaaaaaa-0000-4000-8000-000000000002';
const VPE = 'aaaaaaaa-0000-4000-8000-000000000003';
const CLUB = 'aaaaaaaa-0000-4000-8000-000000000004';
const SLOT_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const SLOT_B = 'aaaaaaaa-0000-4000-8000-00000000000b';

interface StubbedProject {
  pathCode: string;
  projectCode: string;
  level: number;
}

interface StubbedSlot {
  id: string;
  projectCode: string;
  createdAt: Date;
}

function makeStubRepo(overrides: {
  record?: {
    id: string;
    personId: string;
    clubUnitId: string;
    pathCode: string;
    memberMarkedCompleteAt?: string | null;
    vpeConfirmedAt?: string | null;
  } | null;
  projects: StubbedProject[];
  deliveries: StubbedSlot[];
  approvals: SlotApproval[];
}): EducationRecordRepository {
  const record = overrides.record;
  const updated: { levels: unknown[] } = { levels: [] };
  return {
    findById: async () =>
      record
        ? {
            id: record.id,
            personId: record.personId,
            clubUnitId: record.clubUnitId,
            pathCode: record.pathCode,
            startedAt: '2026-01-01T00:00:00.000Z',
            completedAt: null,
            credential: null,
            levels: [
              {
                level: 1,
                projectsDelivered: [],
                educationSeriesPresentation: null,
                memberMarkedCompleteAt: record.memberMarkedCompleteAt ?? null,
                vpeConfirmedAt: record.vpeConfirmedAt ?? null,
                vpeConfirmedBy: null,
                tiAwardRecordedAt: null,
                provenance: 'portal',
                backfilledAt: null,
              },
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
          }
        : null,
    findRequiredProjects: async () => overrides.projects as never,
    findDeliveredSlots: async () =>
      overrides.deliveries.map((s) => ({ ...s, meetingId: '', title: '' })) as never,
    findApprovalsForSlots: async () => overrides.approvals,
    updateLevels: async (id: string, levels: unknown[]) => {
      updated.levels = levels;
      return { id, levels } as never;
    },
    findPathCredential: async () => 'PM5',
    // Unused in these tests but part of the shape.
    create: async () => ({}) as never,
    findByClub: async () => [],
    findByPersonAndClub: async () => [],
  } as unknown as EducationRecordRepository;
}

describe('EducationRecordService — Slice 3 approval gating', () => {
  let projects: StubbedProject[];

  beforeEach(() => {
    projects = [
      { pathCode: 'PM', projectCode: 'PM-ICE-BREAKER', level: 1 },
      { pathCode: 'PM', projectCode: 'PM-EVAL-FEEDBACK', level: 1 },
    ];
  });

  it('rejects markLevelComplete when a delivery is pending VPE approval', async () => {
    const service = new EducationRecordService(
      makeStubRepo({
        record: { id: RECORD_ID, personId: PERSON, clubUnitId: CLUB, pathCode: 'PM' },
        projects,
        deliveries: [
          { id: SLOT_A, projectCode: 'PM-ICE-BREAKER', createdAt: new Date() },
          { id: SLOT_B, projectCode: 'PM-EVAL-FEEDBACK', createdAt: new Date() },
        ],
        approvals: [
          { speechSlotId: SLOT_A, status: 'approved' },
          { speechSlotId: SLOT_B, status: 'requested' },
        ],
      }),
    );

    await expect(service.markLevelComplete(RECORD_ID, 1)).rejects.toMatchObject({
      // The message names the specific project the VPE still needs to act on,
      // so a member reading the error knows what's holding them up.
      message: expect.stringContaining('PM-EVAL-FEEDBACK'),
    });
    await expect(service.markLevelComplete(RECORD_ID, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects markLevelComplete when a delivery has been denied', async () => {
    const service = new EducationRecordService(
      makeStubRepo({
        record: { id: RECORD_ID, personId: PERSON, clubUnitId: CLUB, pathCode: 'PM' },
        projects,
        deliveries: [
          { id: SLOT_A, projectCode: 'PM-ICE-BREAKER', createdAt: new Date() },
          { id: SLOT_B, projectCode: 'PM-EVAL-FEEDBACK', createdAt: new Date() },
        ],
        approvals: [
          { speechSlotId: SLOT_A, status: 'approved' },
          { speechSlotId: SLOT_B, status: 'denied' },
        ],
      }),
    );

    await expect(service.markLevelComplete(RECORD_ID, 1)).rejects.toMatchObject({
      message: expect.stringContaining('denied'),
    });
  });

  it('allows markLevelComplete when every delivery is approved', async () => {
    const service = new EducationRecordService(
      makeStubRepo({
        record: { id: RECORD_ID, personId: PERSON, clubUnitId: CLUB, pathCode: 'PM' },
        projects,
        deliveries: [
          { id: SLOT_A, projectCode: 'PM-ICE-BREAKER', createdAt: new Date() },
          { id: SLOT_B, projectCode: 'PM-EVAL-FEEDBACK', createdAt: new Date() },
        ],
        approvals: [
          { speechSlotId: SLOT_A, status: 'approved' },
          { speechSlotId: SLOT_B, status: 'approved' },
        ],
      }),
    );

    await expect(service.markLevelComplete(RECORD_ID, 1)).resolves.toBeTruthy();
  });

  it('grandfathers slots with no SpeechApproval row on file', async () => {
    // A delivered slot that predates the M11 workflow will have no
    // SpeechApproval row — the tightening shouldn't retroactively lock those
    // members out. Only `requested` or `denied` blocks; `undefined` passes.
    const service = new EducationRecordService(
      makeStubRepo({
        record: { id: RECORD_ID, personId: PERSON, clubUnitId: CLUB, pathCode: 'PM' },
        projects,
        deliveries: [
          { id: SLOT_A, projectCode: 'PM-ICE-BREAKER', createdAt: new Date() },
          { id: SLOT_B, projectCode: 'PM-EVAL-FEEDBACK', createdAt: new Date() },
        ],
        approvals: [], // No approval rows at all.
      }),
    );

    await expect(service.markLevelComplete(RECORD_ID, 1)).resolves.toBeTruthy();
  });

  it('rejects confirmLevel when an approval flipped to pending after the member marked complete', async () => {
    // Belt-and-braces: even though the workflow shouldn't produce this state
    // (approvals are append-only monotonic), the confirm step re-verifies
    // because it's the last check before `vpeConfirmedAt` becomes the DCP
    // projection.
    const service = new EducationRecordService(
      makeStubRepo({
        record: {
          id: RECORD_ID,
          personId: PERSON,
          clubUnitId: CLUB,
          pathCode: 'PM',
          memberMarkedCompleteAt: '2026-02-01T00:00:00.000Z',
        },
        projects,
        deliveries: [
          { id: SLOT_A, projectCode: 'PM-ICE-BREAKER', createdAt: new Date() },
          { id: SLOT_B, projectCode: 'PM-EVAL-FEEDBACK', createdAt: new Date() },
        ],
        approvals: [
          { speechSlotId: SLOT_A, status: 'approved' },
          { speechSlotId: SLOT_B, status: 'requested' },
        ],
      }),
    );

    await expect(service.confirmLevel(RECORD_ID, 1, VPE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('confirmLevel still refuses when the member has not marked complete', async () => {
    const service = new EducationRecordService(
      makeStubRepo({
        record: { id: RECORD_ID, personId: PERSON, clubUnitId: CLUB, pathCode: 'PM' },
        projects,
        deliveries: [],
        approvals: [],
      }),
    );

    await expect(service.confirmLevel(RECORD_ID, 1, VPE)).rejects.toMatchObject({
      message: expect.stringContaining('not marked'),
    });
  });

  it('markLevelComplete rejects when the record is missing', async () => {
    const service = new EducationRecordService(
      makeStubRepo({ record: null, projects: [], deliveries: [], approvals: [] }),
    );

    await expect(service.markLevelComplete(RECORD_ID, 1)).rejects.toBeInstanceOf(NotFoundException);
  });
});

/**
 * M12: `create()` with `startingLevel` — the VPE "start pathway mid-level"
 * flow. Levels below the starting level get bulk-marked complete with no
 * `projectsDelivered` evidence (`backfilledAt` set), attributed to whoever
 * the controller passes as `confirmedBy`.
 */
describe('EducationRecordService — create with startingLevel', () => {
  function makeCreateStubRepo(): {
    repo: EducationRecordRepository;
    calls: Array<{ personId: string; clubUnitId: string; pathCode: string; levels?: unknown[] }>;
  } {
    const calls: Array<{
      personId: string;
      clubUnitId: string;
      pathCode: string;
      levels?: unknown[];
    }> = [];
    const repo = {
      create: async (input: {
        personId: string;
        clubUnitId: string;
        pathCode: string;
        levels?: unknown[];
      }) => {
        calls.push(input);
        return { id: RECORD_ID, ...input, startedAt: new Date().toISOString() } as never;
      },
    } as unknown as EducationRecordRepository;
    return { repo, calls };
  }

  it('starts with no levels when startingLevel is omitted', async () => {
    const { repo, calls } = makeCreateStubRepo();
    const service = new EducationRecordService(repo);

    await service.create({ personId: PERSON, clubUnitId: CLUB, pathCode: 'PM' });

    expect(calls[0]!.levels).toEqual([]);
  });

  it('starts with no levels when startingLevel is 1', async () => {
    const { repo, calls } = makeCreateStubRepo();
    const service = new EducationRecordService(repo);

    await service.create({ personId: PERSON, clubUnitId: CLUB, pathCode: 'PM', startingLevel: 1 });

    expect(calls[0]!.levels).toEqual([]);
  });

  it('backfills levels below startingLevel, attributed to the passed confirmedBy', async () => {
    const { repo, calls } = makeCreateStubRepo();
    const service = new EducationRecordService(repo);

    await service.create({
      personId: PERSON,
      clubUnitId: CLUB,
      pathCode: 'PM',
      startingLevel: 3,
      confirmedBy: VPE,
    });

    const levels = calls[0]!.levels as Array<{
      level: number;
      vpeConfirmedBy: string | null;
      backfilledAt: string | null;
    }>;
    expect(levels.map((l) => l.level)).toEqual([1, 2]);
    expect(levels.every((l) => l.vpeConfirmedBy === VPE)).toBe(true);
    expect(levels.every((l) => l.backfilledAt !== null)).toBe(true);
  });

  it('leaves vpeConfirmedBy null when no confirmedBy is passed', async () => {
    const { repo, calls } = makeCreateStubRepo();
    const service = new EducationRecordService(repo);

    await service.create({ personId: PERSON, clubUnitId: CLUB, pathCode: 'PM', startingLevel: 2 });

    const levels = calls[0]!.levels as Array<{ vpeConfirmedBy: string | null }>;
    expect(levels[0]!.vpeConfirmedBy).toBeNull();
  });
});
