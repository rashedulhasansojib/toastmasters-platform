import type { EducationRecordLevel } from '@toastmasters/contracts';
import { PATH_LEVELS } from './club-education-progress';

/**
 * The levels below a mid-path start, bulk-marked complete with no
 * `projectsDelivered` evidence — used both when a meeting-close auto-start
 * lands on a level >1 (no human actor, `confirmedBy: null`) and when a VPE
 * manually starts a member's path at a level >1 (`confirmedBy` is the VPE's
 * `personId`). `backfilledAt` is what lets the roster tell these apart from
 * a level the VPE actually reviewed project-by-project, even though both
 * set `vpeConfirmedAt` — the only date the DCP projection reads.
 */
export function buildBackfillLevels(
  startingLevel: number,
  confirmedBy: string | null,
  at: Date,
): EducationRecordLevel[] {
  const stamp = at.toISOString();
  return PATH_LEVELS.filter((level) => level < startingLevel).map((level) => ({
    level,
    projectsDelivered: [],
    educationSeriesPresentation: null,
    memberMarkedCompleteAt: stamp,
    vpeConfirmedAt: stamp,
    vpeConfirmedBy: confirmedBy,
    tiAwardRecordedAt: null,
    provenance: 'portal' as const,
    backfilledAt: stamp,
  }));
}
