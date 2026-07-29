import { Injectable } from '@nestjs/common';
import type { ClubEducationProgressRow } from '@toastmasters/contracts';
import { buildClubEducationProgress } from './club-education-progress';
import { EducationProgressRepository } from './education-progress.repository';

/** M10: the club education roster — a read-only projection, never a stored record. */
@Injectable()
export class EducationProgressService {
  constructor(private readonly progress: EducationProgressRepository) {}

  async listByClub(clubUnitId: string): Promise<ClubEducationProgressRow[]> {
    const [members, records, projects, approvals] = await Promise.all([
      this.progress.findClubMembers(clubUnitId),
      this.progress.findClubRecords(clubUnitId),
      this.progress.findCatalogProjects(),
      this.progress.findApprovalsForClub(clubUnitId),
    ]);
    const deliveries = await this.progress.findDeliveries(members.map((m) => m.personId));
    return buildClubEducationProgress({ members, records, projects, deliveries, approvals });
  }
}
