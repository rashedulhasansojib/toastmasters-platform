import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { getPrisma } from '@toastmasters/db';

export const DCP_PROJECTION_QUEUE = 'dcp-projection';

interface GoalDef {
  goalNumber: number;
  area: 'education' | 'membership' | 'training' | 'administration';
  label: string;
  targetCount: number;
}

const GOAL_DEFS: GoalDef[] = [
  { goalNumber: 1, area: 'education', label: 'Four Level 1 awards', targetCount: 4 },
  { goalNumber: 2, area: 'education', label: 'Two Level 2 awards', targetCount: 2 },
  { goalNumber: 3, area: 'education', label: 'Two more Level 2 awards', targetCount: 2 },
  { goalNumber: 4, area: 'education', label: 'Two Level 3 awards', targetCount: 2 },
  { goalNumber: 5, area: 'education', label: 'One Level 4, Level 5 or DTM award', targetCount: 1 },
  {
    goalNumber: 6,
    area: 'education',
    label: 'One more Level 4, Level 5 or DTM award',
    targetCount: 1,
  },
  {
    goalNumber: 7,
    area: 'membership',
    label: 'Four new, dual or reinstating members',
    targetCount: 4,
  },
  {
    goalNumber: 8,
    area: 'membership',
    label: 'Four more new, dual or reinstating members',
    targetCount: 4,
  },
  {
    goalNumber: 9,
    area: 'training',
    label: '≥4 officer roles trained in each training period',
    targetCount: 4,
  },
  {
    goalNumber: 10,
    area: 'administration',
    label: 'On-time dues for 8 members + officer list',
    targetCount: 8,
  },
];

interface ConfirmedLevel {
  recordId: string;
  level: number;
  vpeConfirmedAt: string;
}

/**
 * M6 Slice 3 / M7 Slice 5: system-design.md §16.3, FR-OVS-5. Nightly, per
 * club per program year, each goal traceable to its contributing records.
 * Goals 1-6 (education levels) are wired to `EducationRecord`'s
 * VPE-confirmed completions as of M7 — only `vpeConfirmedAt`, never
 * `memberMarkedCompleteAt`, ever counts (FR-EDU-3). Goals 7/8 (membership
 * growth) come from `ClubMembership`. Goals 9/10 stay `not_yet_tracked` —
 * officer training periods and TI officer-list submission still aren't
 * modelled anywhere. See the M6/M7 plan docs' scope-sequencing notes.
 */
@Processor(DCP_PROJECTION_QUEUE)
export class DcpProjectionProcessor extends WorkerHost {
  private readonly logger = new Logger(DcpProjectionProcessor.name);

  async process(_job: Job): Promise<{ clubsProcessed: number }> {
    const db = getPrisma();
    const clubs = await db.orgUnit.findMany({ where: { type: 'club' }, select: { id: true } });
    let processed = 0;

    for (const club of clubs) {
      const programYear = await db.programYear.findFirst({ where: { status: 'current' } });
      if (!programYear) continue;

      const qualifyingMemberships = await db.clubMembership.findMany({
        where: {
          clubUnitId: club.id,
          memberType: { in: ['new', 'dual', 'reinstated'] },
          joinedAt: { gte: programYear.startsOn, lte: programYear.endsOn },
        },
        select: { id: true },
      });
      const qualifyingCount = qualifyingMemberships.length;

      const activeMemberCount = await db.clubMembership.count({
        where: { clubUnitId: club.id, localStatus: 'active' },
      });

      const csp = await db.clubSuccessPlan.findUnique({
        where: { clubUnitId_programYearId: { clubUnitId: club.id, programYearId: programYear.id } },
      });

      const educationRecords = await db.educationRecord.findMany({
        where: { clubUnitId: club.id },
      });
      const confirmedByLevel = new Map<number, ConfirmedLevel[]>();
      for (const record of educationRecords) {
        const levels = record.levels as unknown as Array<{
          level: number;
          vpeConfirmedAt: string | null;
        }>;
        for (const level of levels) {
          if (!level.vpeConfirmedAt) continue;
          const bucket = level.level >= 4 ? 4 : level.level; // Level 4/5/DTM share goals 5/6
          const list = confirmedByLevel.get(bucket) ?? [];
          list.push({
            recordId: record.id,
            level: level.level,
            vpeConfirmedAt: level.vpeConfirmedAt,
          });
          confirmedByLevel.set(bucket, list);
        }
      }
      const level1 = confirmedByLevel.get(1) ?? [];
      const level2 = confirmedByLevel.get(2) ?? [];
      const level3 = confirmedByLevel.get(3) ?? [];
      const level4Plus = confirmedByLevel.get(4) ?? [];

      const goals = GOAL_DEFS.map((def) => {
        if (def.goalNumber === 7) {
          const achievedCount = Math.min(qualifyingCount, 4);
          return {
            ...def,
            achievedCount,
            achieved: achievedCount >= 4,
            dataSource: 'computed' as const,
            contributingRecordIds: qualifyingMemberships.slice(0, 4).map((m) => m.id),
          };
        }
        if (def.goalNumber === 8) {
          const achievedCount = Math.max(0, Math.min(qualifyingCount - 4, 4));
          return {
            ...def,
            achievedCount,
            achieved: qualifyingCount >= 8,
            dataSource: 'computed' as const,
            contributingRecordIds: qualifyingMemberships.slice(4, 8).map((m) => m.id),
          };
        }
        if (def.goalNumber === 1) {
          return {
            ...def,
            achievedCount: Math.min(level1.length, 4),
            achieved: level1.length >= 4,
            dataSource: 'computed' as const,
            contributingRecordIds: level1.slice(0, 4).map((c) => c.recordId),
          };
        }
        if (def.goalNumber === 2) {
          return {
            ...def,
            achievedCount: Math.min(level2.length, 2),
            achieved: level2.length >= 2,
            dataSource: 'computed' as const,
            contributingRecordIds: level2.slice(0, 2).map((c) => c.recordId),
          };
        }
        if (def.goalNumber === 3) {
          return {
            ...def,
            achievedCount: Math.max(0, Math.min(level2.length - 2, 2)),
            achieved: level2.length >= 4,
            dataSource: 'computed' as const,
            contributingRecordIds: level2.slice(2, 4).map((c) => c.recordId),
          };
        }
        if (def.goalNumber === 4) {
          return {
            ...def,
            achievedCount: Math.min(level3.length, 2),
            achieved: level3.length >= 2,
            dataSource: 'computed' as const,
            contributingRecordIds: level3.slice(0, 2).map((c) => c.recordId),
          };
        }
        if (def.goalNumber === 5) {
          return {
            ...def,
            achievedCount: Math.min(level4Plus.length, 1),
            achieved: level4Plus.length >= 1,
            dataSource: 'computed' as const,
            contributingRecordIds: level4Plus.slice(0, 1).map((c) => c.recordId),
          };
        }
        if (def.goalNumber === 6) {
          return {
            ...def,
            achievedCount: Math.max(0, Math.min(level4Plus.length - 1, 1)),
            achieved: level4Plus.length >= 2,
            dataSource: 'computed' as const,
            contributingRecordIds: level4Plus.slice(1, 2).map((c) => c.recordId),
          };
        }
        return {
          ...def,
          achievedCount: 0,
          achieved: false,
          dataSource: 'not_yet_tracked' as const,
          contributingRecordIds: [] as string[],
        };
      });

      const membershipQualifierMet = activeMemberCount >= 20 || qualifyingCount >= 5;
      const clubSuccessPlanQualifierMet = csp?.submittedAt != null;
      const achievedGoalCount = goals.filter((g) => g.achieved).length;

      let projectedLevel:
        | 'none'
        | 'distinguished'
        | 'select_distinguished'
        | 'presidents_distinguished'
        | 'smedley_distinguished' = 'none';
      if (membershipQualifierMet && clubSuccessPlanQualifierMet) {
        if (achievedGoalCount >= 10 && activeMemberCount >= 25)
          projectedLevel = 'smedley_distinguished';
        else if (achievedGoalCount >= 9 && activeMemberCount >= 20)
          projectedLevel = 'presidents_distinguished';
        else if (achievedGoalCount >= 7) projectedLevel = 'select_distinguished';
        else if (achievedGoalCount >= 5) projectedLevel = 'distinguished';
      }

      await db.dcpProjection.upsert({
        where: { clubUnitId_programYearId: { clubUnitId: club.id, programYearId: programYear.id } },
        create: {
          clubUnitId: club.id,
          programYearId: programYear.id,
          goals,
          membershipQualifierMet,
          clubSuccessPlanQualifierMet,
          projectedLevel,
        },
        update: {
          goals,
          membershipQualifierMet,
          clubSuccessPlanQualifierMet,
          projectedLevel,
          computedAt: new Date(),
        },
      });
      processed += 1;
    }

    this.logger.log({ clubsProcessed: processed }, 'dcp projection job ran');
    return { clubsProcessed: processed };
  }
}
