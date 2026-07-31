import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateOrgUnitRootRequest,
  OrgTreeLevel,
  OrgUnit,
  PlatformConsoleSummary,
  PlatformUnitCounts,
} from '@toastmasters/contracts';
import { OrgUnitRepository } from '../org/org.repository';
import { PlatformConsoleRepository } from './platform-console.repository';

/**
 * Prisma's generated CRUD methods raise P2002 for a unique violation, but
 * `createRoot()` inserts via `$queryRaw` — that surfaces as P2010 ("raw query
 * failed"), with the actual Postgres code (23505) nested under
 * `meta.driverAdapterError.cause.originalCode`, not on `error.code` directly.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'P2002') return true;
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return false;
  const cause = (meta as { driverAdapterError?: { cause?: unknown } }).driverAdapterError?.cause;
  if (typeof cause !== 'object' || cause === null) return false;
  return (cause as { originalCode?: unknown }).originalCode === '23505';
}

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

    const [activePeopleCount, programYearId, demoSignupCount] = await Promise.all([
      this.console.countActivePeople(),
      this.console.currentProgramYearId(),
      this.console.countDemoSignups(),
    ]);

    return {
      region,
      tree,
      counts: countByTier(tree),
      activePeopleCount,
      programYearId,
      demoSignupCount,
    };
  }

  /**
   * One level of the org-tree browser (Slice: card drill-down). No
   * `parentId` → the root level (top-level org units, i.e. the region(s)).
   * `regionUnitId` isn't used here — the route already authorized against it
   * (rbac-design.md §4.1), and the tree itself is global, not per-region.
   */
  async browseOrgTree(parentId?: string): Promise<OrgTreeLevel> {
    if (!parentId) {
      return { ancestors: [], children: await this.orgUnits.findRootsWithCounts() };
    }

    const parent = await this.orgUnits.findById(parentId);
    if (!parent) throw new NotFoundException('Org unit not found');

    const [ancestors, children] = await Promise.all([
      this.orgUnits.findAncestors(parent.path),
      this.orgUnits.findChildrenWithCounts(parentId),
    ]);

    return { ancestors: [...ancestors, parent], children };
  }

  /**
   * "Add new Region" at the top of the browser. `OrgUnitRepository.createRoot`
   * already existed (used by fixtures/bootstrap) but was never reachable from
   * a route — this is that wiring. `org_unit_single_region_root` is a hard
   * partial unique index, so a second attempt 409s rather than 500s.
   */
  async createRegionRoot(input: CreateOrgUnitRootRequest): Promise<OrgUnit> {
    try {
      return await this.orgUnits.createRoot({ type: 'region', ...input });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A region already exists — only one region root is supported');
      }
      throw error;
    }
  }
}
