import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrgUnit, PlatformConsoleSummary, PlatformUnitCounts } from '@toastmasters/contracts';
import { OrgUnitRepository } from '../org/org.repository';
import { PlatformConsoleRepository } from './platform-console.repository';

function countByTier(units: OrgUnit[]): PlatformUnitCounts {
  const counts: PlatformUnitCounts = { district: 0, division: 0, area: 0, club: 0 };
  for (const unit of units) {
    if (unit.type === 'district') counts.district += 1;
    else if (unit.type === 'division') counts.division += 1;
    else if (unit.type === 'area') counts.area += 1;
    else if (unit.type === 'club') counts.club += 1;
  }
  return counts;
}

@Injectable()
export class PlatformConsoleService {
  constructor(
    private readonly orgUnits: OrgUnitRepository,
    private readonly console: PlatformConsoleRepository,
  ) {}

  /**
   * `regionUnitId` is the unit the route already authorized against, so no
   * second permission check happens here — the ResourceGuard resolved its
   * path and ran authorize() before this service was reached.
   */
  async summary(regionUnitId: string): Promise<PlatformConsoleSummary> {
    const region = await this.orgUnits.findById(regionUnitId);
    if (!region) throw new NotFoundException('Org unit not found');

    // findSubtree is descendant-or-self, so the region's own row comes back
    // in the list; drop it — `region` carries it, and leaving it in would
    // make the client render the root twice.
    const subtree = await this.orgUnits.findSubtree(region.path);
    const tree = subtree.filter((unit) => unit.id !== region.id);

    const [activePeopleCount, programYearId] = await Promise.all([
      this.console.countActivePeople(),
      this.console.currentProgramYearId(),
    ]);

    return {
      region,
      tree,
      counts: countByTier(tree),
      activePeopleCount,
      programYearId,
    };
  }
}
