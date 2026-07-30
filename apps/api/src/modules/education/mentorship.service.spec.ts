import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type {
  EducationRecord,
  MentorAvailability,
  MentorshipPairing,
} from '@toastmasters/contracts';
import type { ClubMembership } from '@toastmasters/contracts';
import { MentorshipService } from './mentorship.service';

function pairing(overrides: Partial<MentorshipPairing> = {}): MentorshipPairing {
  return {
    id: 'pairing-1',
    orgUnitId: 'club-1',
    programYearId: '2026',
    mentorPersonId: 'mentor-1',
    menteePersonId: 'mentee-1',
    purpose: 'new_member_onboarding',
    status: 'active',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    endedReason: null,
    assignedBy: 'vpe-1',
    goals: [],
    checkIns: [],
    ...overrides,
  };
}

function availability(overrides: Partial<MentorAvailability> = {}): MentorAvailability {
  return {
    id: 'avail-1',
    personId: 'mentor-1',
    orgUnitId: 'club-1',
    isAvailable: true,
    maxConcurrentMentees: 3,
    strengths: [],
    preferredPurposes: [],
    ...overrides,
  };
}

function educationRecord(overrides: Partial<EducationRecord> = {}): EducationRecord {
  return {
    id: 'rec-1',
    personId: 'person-1',
    clubUnitId: 'club-1',
    pathCode: 'PI',
    startedAt: '2025-01-01T00:00:00.000Z',
    completedAt: null,
    credential: null,
    levels: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function membership(overrides: Partial<ClubMembership> = {}): ClubMembership {
  return {
    id: 'membership-1',
    personId: 'mentor-1',
    clubUnitId: 'club-1',
    memberType: 'member',
    joinedAt: '2026-01-01T00:00:00.000Z',
    leftAt: null,
    isPrimary: true,
    tiStanding: 'active',
    localStatus: 'active',
    provenance: 'portal',
    lastReconciledAt: null,
    ...overrides,
  };
}

function makeService() {
  const pairings = {
    create: vi.fn().mockResolvedValue(pairing()),
    findActiveByMenteeAndPurpose: vi.fn().mockResolvedValue(null),
    addCheckIn: vi.fn().mockResolvedValue(pairing()),
    end: vi.fn().mockResolvedValue(pairing({ status: 'ended' })),
    findByClub: vi.fn().mockResolvedValue([pairing()]),
    countActiveByMentor: vi.fn().mockResolvedValue(0),
    findMismatchedWith: vi.fn().mockResolvedValue(0),
    findById: vi.fn().mockResolvedValue(pairing()),
  };
  const availabilityRepo = { findByClub: vi.fn().mockResolvedValue([]), upsert: vi.fn() };
  const educationRecords = { findByPersonAndClub: vi.fn().mockResolvedValue([]) };
  const clubMemberships = { findByPerson: vi.fn().mockResolvedValue([]) };

  const service = new MentorshipService(
    pairings as never,
    availabilityRepo as never,
    educationRecords as never,
    clubMemberships as never,
  );
  return { service, pairings, availabilityRepo, educationRecords, clubMemberships };
}

describe('MentorshipService.create', () => {
  it('rejects a second active-or-proposed pairing for the same mentee and purpose', async () => {
    const { service, pairings } = makeService();
    pairings.findActiveByMenteeAndPurpose.mockResolvedValue(pairing());
    await expect(
      service.create({
        orgUnitId: 'club-1',
        programYearId: '2026',
        mentorPersonId: 'mentor-2',
        menteePersonId: 'mentee-1',
        purpose: 'new_member_onboarding',
        assignedBy: 'vpe-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(pairings.create).not.toHaveBeenCalled();
  });

  it('creates the pairing when the mentee has no conflicting pairing for that purpose', async () => {
    const { service, pairings } = makeService();
    const input = {
      orgUnitId: 'club-1',
      programYearId: '2026',
      mentorPersonId: 'mentor-2',
      menteePersonId: 'mentee-1',
      purpose: 'contest_prep' as const,
      assignedBy: 'vpe-1',
    };
    await service.create(input);
    expect(pairings.create).toHaveBeenCalledWith(input);
  });
});

describe('MentorshipService.addCheckIn / end / list', () => {
  it('addCheckIn builds a timestamped check-in and delegates to the repository', async () => {
    const { service, pairings } = makeService();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'));
    await service.addCheckIn('pairing-1', 'vpe-1', 'making good progress', '2026-05-01');
    vi.useRealTimers();

    expect(pairings.addCheckIn).toHaveBeenCalledWith('pairing-1', {
      at: '2026-04-01T00:00:00.000Z',
      byPersonId: 'vpe-1',
      note: 'making good progress',
      nextDueOn: '2026-05-01',
    });
  });

  it('addCheckIn defaults nextDueOn to null when not supplied', async () => {
    const { service, pairings } = makeService();
    await service.addCheckIn('pairing-1', 'vpe-1', 'note');
    expect(pairings.addCheckIn.mock.calls[0][1]).toMatchObject({ nextDueOn: null });
  });

  it('end delegates to the repository with the ended reason', async () => {
    const { service, pairings } = makeService();
    await service.end('pairing-1', 'mismatch');
    expect(pairings.end).toHaveBeenCalledWith('pairing-1', 'mismatch');
  });

  it('list delegates to findByClub', async () => {
    const { service, pairings } = makeService();
    await service.list('club-1');
    expect(pairings.findByClub).toHaveBeenCalledWith('club-1');
  });
});

describe('MentorshipService.suggest', () => {
  it('excludes the mentee themself, mentors at their concurrent-mentee cap, and mentors below the Level 2 competence floor', async () => {
    const { service, pairings, availabilityRepo, educationRecords, clubMemberships } =
      makeService();

    availabilityRepo.findByClub.mockResolvedValue([
      availability({ personId: 'mentee-1' }), // is also listed as "available" — must still be excluded
      availability({ personId: 'mentor-capped', maxConcurrentMentees: 1 }),
      availability({ personId: 'mentor-no-level2', maxConcurrentMentees: 3 }),
      availability({ personId: 'mentor-qualified', maxConcurrentMentees: 3 }),
    ]);
    educationRecords.findByPersonAndClub.mockImplementation((personId: string) => {
      if (personId === 'mentee-1') return Promise.resolve([educationRecord({ pathCode: 'PI' })]);
      if (personId === 'mentor-no-level2')
        return Promise.resolve([
          educationRecord({
            pathCode: 'PI',
            levels: [
              {
                level: 1,
                projectsDelivered: [],
                educationSeriesPresentation: null,
                memberMarkedCompleteAt: null,
                vpeConfirmedAt: null,
                vpeConfirmedBy: null,
                tiAwardRecordedAt: null,
                provenance: 'portal',
              },
            ],
          }),
        ]);
      if (personId === 'mentor-qualified')
        return Promise.resolve([
          educationRecord({
            pathCode: 'PI',
            levels: [
              {
                level: 2,
                projectsDelivered: [],
                educationSeriesPresentation: null,
                memberMarkedCompleteAt: null,
                vpeConfirmedAt: '2026-01-01T00:00:00.000Z',
                vpeConfirmedBy: 'vpe-1',
                tiAwardRecordedAt: null,
                provenance: 'portal',
              },
            ],
          }),
        ]);
      return Promise.resolve([]);
    });
    pairings.countActiveByMentor.mockImplementation((personId: string) =>
      Promise.resolve(personId === 'mentor-capped' ? 1 : 0),
    );
    clubMemberships.findByPerson.mockResolvedValue([
      membership({ joinedAt: '2026-01-01T00:00:00.000Z' }),
    ]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const result = await service.suggest('club-1', 'mentee-1');
    vi.useRealTimers();

    expect(result.map((s) => s.mentorPersonId)).toEqual(['mentor-qualified']);
    // short-circuited before the education-record lookup for the mentee themself
    expect(pairings.countActiveByMentor).not.toHaveBeenCalledWith('mentee-1');
    // short-circuited before the membership/mismatch lookups once capped or below the floor
    expect(clubMemberships.findByPerson).not.toHaveBeenCalledWith('mentor-capped');
    expect(clubMemberships.findByPerson).not.toHaveBeenCalledWith('mentor-no-level2');
  });

  it('ranks by path overlap + tenure − current load − prior mismatches with this mentee, highest score first', async () => {
    const { service, pairings, availabilityRepo, educationRecords, clubMemberships } =
      makeService();

    availabilityRepo.findByClub.mockResolvedValue([
      availability({ personId: 'mentor-a' }),
      availability({ personId: 'mentor-b' }),
    ]);
    const menteeRecords = [
      educationRecord({ pathCode: 'PI' }),
      educationRecord({ pathCode: 'DL' }),
    ];
    const confirmedLevel2 = {
      level: 2,
      projectsDelivered: [],
      educationSeriesPresentation: null,
      memberMarkedCompleteAt: null,
      vpeConfirmedAt: '2026-01-01T00:00:00.000Z',
      vpeConfirmedBy: 'vpe-1',
      tiAwardRecordedAt: null,
      provenance: 'portal' as const,
    };
    educationRecords.findByPersonAndClub.mockImplementation((personId: string) => {
      if (personId === 'mentee-1') return Promise.resolve(menteeRecords);
      if (personId === 'mentor-a')
        return Promise.resolve([educationRecord({ pathCode: 'PI', levels: [confirmedLevel2] })]); // 1 path overlap
      if (personId === 'mentor-b')
        return Promise.resolve([
          educationRecord({ pathCode: 'PI', levels: [confirmedLevel2] }),
          educationRecord({ pathCode: 'DL', levels: [confirmedLevel2] }),
        ]); // 2 path overlap
      return Promise.resolve([]);
    });
    pairings.countActiveByMentor.mockImplementation((personId: string) =>
      Promise.resolve(personId === 'mentor-a' ? 1 : 0),
    );
    clubMemberships.findByPerson.mockImplementation((personId: string) => {
      const joinedAt =
        personId === 'mentor-a' ? '2025-11-02T00:00:00.000Z' : '2026-01-02T00:00:00.000Z';
      return Promise.resolve([membership({ personId, joinedAt })]);
    });
    pairings.findMismatchedWith.mockImplementation((mentorPersonId: string) =>
      Promise.resolve(mentorPersonId === 'mentor-b' ? 1 : 0),
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z')); // mentor-a: ~91d tenure, mentor-b: ~30d tenure
    const result = await service.suggest('club-1', 'mentee-1');
    vi.useRealTimers();

    // mentor-a: pathOverlap 1*10 + tenure(91/30≈3.03) - activeCount 1*5 - mismatch 0 ≈ 8.03
    // mentor-b: pathOverlap 2*10 + tenure(30/30=1) - activeCount 0 - mismatch 1*20 ≈ 1
    expect(result).toHaveLength(2);
    expect(result[0].mentorPersonId).toBe('mentor-a');
    expect(result[0].score).toBeCloseTo(8.033, 1);
    expect(result[0].reasons).toEqual(
      expect.arrayContaining(['shares 1 path(s) with the mentee', 'already mentoring 1']),
    );
    expect(result[1].mentorPersonId).toBe('mentor-b');
    expect(result[1].score).toBeCloseTo(1, 1);
    expect(result[1].reasons).toEqual(
      expect.arrayContaining([
        'shares 2 path(s) with the mentee',
        '1 prior mismatch with this mentee',
      ]),
    );
  });
});
