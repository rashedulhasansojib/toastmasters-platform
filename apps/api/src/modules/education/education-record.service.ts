import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { EducationRecord, EducationRecordLevel } from '@toastmasters/contracts';
import { EducationRecordRepository } from './education-record.repository';
import { PATH_LEVELS } from './club-education-progress';

function confirmedLevel(levels: EducationRecordLevel[], level: number): boolean {
  return levels.find((l) => l.level === level)?.vpeConfirmedAt != null;
}

/**
 * M11 Slice 3: a project whose delivery slot's `SpeechApproval` is not
 * `approved`. The tightening: `markLevelComplete` and `confirmLevel` refuse
 * the transition until the VPE has cleared every project at the level —
 * a delivered-but-pending speech is not evidence a level is done. Null
 * approvals (slots that predate the M11 workflow) are grandfathered and
 * never appear here.
 */
interface BlockingProject {
  projectCode: string;
  status: 'requested' | 'denied';
}

/**
 * M7 Slice 1: system-design.md §10.1, FR-EDU-2/3. `markLevelComplete` is
 * member-initiated but gated on real delivered `PathwayProject` rows
 * (`SpeechSlot.status = 'approved'` on a `closed` meeting) — never bare
 * self-report. Only `confirmLevel` (VPE-only) sets `vpeConfirmedAt`, the
 * one date the DCP projection ever reads (Slice 5).
 */
@Injectable()
export class EducationRecordService {
  constructor(private readonly records: EducationRecordRepository) {}

  create(input: {
    personId: string;
    clubUnitId: string;
    pathCode: string;
  }): Promise<EducationRecord> {
    return this.records.create(input);
  }

  list(clubUnitId: string, personId?: string): Promise<EducationRecord[]> {
    return this.records.findByClub(clubUnitId, personId);
  }

  async markLevelComplete(recordId: string, level: number): Promise<EducationRecord> {
    const record = await this.records.findById(recordId);
    if (!record) throw new NotFoundException('Education record not found');

    const { requiredProjects, deliveredByProject } = await this.assertAllApproved(
      record.personId,
      record.pathCode,
      level,
    );

    const levels = this.upsertLevel(record.levels, level, (existing) => ({
      ...existing,
      projectsDelivered: requiredProjects.map((p) => {
        const slot = deliveredByProject.get(p.projectCode)!;
        return {
          projectCode: p.projectCode,
          speechSlotId: slot.id,
          deliveredAt: slot.createdAt.toISOString(),
        };
      }),
      memberMarkedCompleteAt: new Date().toISOString(),
    }));
    return this.records.updateLevels(recordId, levels);
  }

  async confirmLevel(
    recordId: string,
    level: number,
    vpePersonId: string,
  ): Promise<EducationRecord> {
    const record = await this.records.findById(recordId);
    if (!record) throw new NotFoundException('Education record not found');
    const existing = record.levels.find((l) => l.level === level);
    if (!existing?.memberMarkedCompleteAt) {
      throw new BadRequestException('Member has not marked this level complete yet');
    }

    // Slice 3: re-verify approvals here. `markLevelComplete` already ran this
    // check when `memberMarkedCompleteAt` was stamped, but a record migrated
    // in from before the M11 tightening can carry a stale mark-complete
    // whose underlying approvals never actually cleared — the VPE-confirm
    // step is the last honest place to catch it, before `vpeConfirmedAt`
    // feeds the DCP projection.
    await this.assertAllApproved(record.personId, record.pathCode, level);

    const confirmedAt = new Date();
    const levels = this.upsertLevel(record.levels, level, (current) => ({
      ...current,
      vpeConfirmedAt: confirmedAt.toISOString(),
      vpeConfirmedBy: vpePersonId,
    }));

    // The path is complete once every level carries a VPE confirmation — the
    // only date that ever feeds DCP (FR-EDU-3). Derived here rather than left
    // to a separate "close the path" click, which would be a second chance to
    // get it wrong. Still a portal projection, never an official TI award:
    // `tiAwardRecordedAt` on the level is what records TI's own credit.
    const complete =
      record.completedAt === null && PATH_LEVELS.every((l) => confirmedLevel(levels, l));
    const credential = complete ? await this.records.findPathCredential(record.pathCode) : null;

    return this.records.updateLevels(
      recordId,
      levels,
      complete && credential ? { completedAt: confirmedAt, credential } : undefined,
    );
  }

  /**
   * The shared invariant behind both mark-complete and confirm. Returns the
   * delivered-slot lookup so the caller doesn't re-query.
   *
   * Ordering of the three refusals matters — we surface the most fundamental
   * missing precondition first, so the user (member or VPE) sees the problem
   * they can act on soonest: catalogue → delivery → VPE approval.
   */
  private async assertAllApproved(
    personId: string,
    pathCode: string,
    level: number,
  ): Promise<{
    requiredProjects: Awaited<ReturnType<EducationRecordRepository['findRequiredProjects']>>;
    deliveredByProject: Map<
      string,
      Awaited<ReturnType<EducationRecordRepository['findDeliveredSlots']>>[number]
    >;
  }> {
    const requiredProjects = await this.records.findRequiredProjects(pathCode, level);
    if (requiredProjects.length === 0) {
      throw new BadRequestException(`No projects defined for level ${level} of ${pathCode}`);
    }

    const deliveredSlots = await this.records.findDeliveredSlots(personId, pathCode, level);
    const deliveredByProject = new Map(deliveredSlots.map((s) => [s.projectCode, s]));
    const missing = requiredProjects.filter((p) => !deliveredByProject.has(p.projectCode));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Not all level ${level} projects are delivered yet: ${missing.map((p) => p.projectCode).join(', ')}`,
      );
    }

    const slotIds = requiredProjects.map((p) => deliveredByProject.get(p.projectCode)!.id);
    const approvals = await this.records.findApprovalsForSlots(slotIds);
    const approvalBySlotId = new Map(approvals.map((a) => [a.speechSlotId, a.status]));
    // Slice 3: every delivery needs an approved SpeechApproval, or none at
    // all (grandfathered pre-workflow slot). A pending or denied approval
    // blocks the transition until the VPE decides. Never present a
    // projection as if it were VPE-confirmed.
    const blocking: BlockingProject[] = [];
    for (const project of requiredProjects) {
      const slot = deliveredByProject.get(project.projectCode)!;
      const status = approvalBySlotId.get(slot.id);
      if (status === 'requested' || status === 'denied') {
        blocking.push({ projectCode: project.projectCode, status });
      }
    }
    if (blocking.length > 0) {
      const pending = blocking.filter((b) => b.status === 'requested').map((b) => b.projectCode);
      const denied = blocking.filter((b) => b.status === 'denied').map((b) => b.projectCode);
      const parts: string[] = [];
      if (pending.length > 0) parts.push(`pending VPE approval: ${pending.join(', ')}`);
      if (denied.length > 0) parts.push(`denied: ${denied.join(', ')}`);
      throw new BadRequestException(
        `Cannot advance level ${level} — ${parts.join('; ')}. Every project needs an approved SpeechApproval on file.`,
      );
    }

    return { requiredProjects, deliveredByProject };
  }

  private upsertLevel(
    levels: EducationRecordLevel[],
    level: number,
    update: (existing: EducationRecordLevel) => EducationRecordLevel,
  ): EducationRecordLevel[] {
    const existing = levels.find((l) => l.level === level) ?? {
      level,
      projectsDelivered: [],
      educationSeriesPresentation: null,
      memberMarkedCompleteAt: null,
      vpeConfirmedAt: null,
      vpeConfirmedBy: null,
      tiAwardRecordedAt: null,
      provenance: 'portal' as const,
    };
    const updated = update(existing);
    const others = levels.filter((l) => l.level !== level);
    return [...others, updated].sort((a, b) => a.level - b.level);
  }
}
