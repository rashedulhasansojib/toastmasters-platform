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

/**
 * M6 Slice 3: system-design.md §16.3, FR-OVS-5. Nightly, per club per
 * program year, each goal traceable to its contributing records. Goals
 * 1-6/9/10 have no data source yet (education levels are M7; officer
 * training periods aren't modelled anywhere) — they report
 * `dataSource: 'not_yet_tracked'` rather than a fabricated number. Only
 * goals 7/8 (membership growth, from ClubMembership) are actually
 * computed today. See the M6 plan doc's scope-sequencing note.
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
