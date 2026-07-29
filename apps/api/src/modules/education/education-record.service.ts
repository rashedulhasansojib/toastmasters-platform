import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { EducationRecord, EducationRecordLevel } from '@toastmasters/contracts';
import { EducationRecordRepository } from './education-record.repository';
import { PATH_LEVELS } from './club-education-progress';

function confirmedLevel(levels: EducationRecordLevel[], level: number): boolean {
  return levels.find((l) => l.level === level)?.vpeConfirmedAt != null;
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

    const requiredProjects = await this.records.findRequiredProjects(record.pathCode, level);
    if (requiredProjects.length === 0) {
      throw new BadRequestException(`No projects defined for level ${level} of ${record.pathCode}`);
    }

    const deliveredSlots = await this.records.findDeliveredSlots(
      record.personId,
      record.pathCode,
      level,
    );
    const deliveredByProject = new Map(deliveredSlots.map((s) => [s.projectCode, s]));
    const missing = requiredProjects.filter((p) => !deliveredByProject.has(p.projectCode));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Not all level ${level} projects are delivered yet: ${missing.map((p) => p.projectCode).join(', ')}`,
      );
    }

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
