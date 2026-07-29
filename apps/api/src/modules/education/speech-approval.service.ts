import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { SpeechApproval, SpeechApprovalStatus } from '@toastmasters/contracts';
import { SpeechApprovalRepository } from './speech-approval.repository';

/**
 * M11 Slice 2: VPE decisions on auto-requested speech-credit approvals. The
 * repository owns the atomic status change; this service enforces the
 * two-part scope check the router alone can't do — the approval must belong
 * to the club named in the URL, not just any club the VPE happens to hold a
 * grant on. Without that check, a VPE with a scope-inheriting grant (region
 * root, someday) could act on any approval by id.
 */
@Injectable()
export class SpeechApprovalService {
  constructor(private readonly repo: SpeechApprovalRepository) {}

  list(clubUnitId: string, status?: SpeechApprovalStatus): Promise<SpeechApproval[]> {
    return this.repo.listForClub(clubUnitId, status);
  }

  async approve(id: string, clubUnitId: string, approverPersonId: string): Promise<SpeechApproval> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.clubUnitId !== clubUnitId) {
      // A cross-club approval id gets a 404 rather than a 403 — its existence
      // is not the caller's business, and CLAUDE.md §6 keeps existence itself
      // opaque across a scope boundary.
      throw new NotFoundException('Approval not found');
    }
    if (existing.status !== 'requested') {
      throw new BadRequestException(`Approval already ${existing.status}`);
    }
    const updated = await this.repo.approve(id, approverPersonId, new Date());
    // A null return means a concurrent request beat us to the status change.
    // Re-read and surface the current state rather than pretending we won.
    if (!updated) {
      const current = await this.repo.findById(id);
      throw new BadRequestException(
        current ? `Approval already ${current.status}` : 'Approval not found',
      );
    }
    return updated;
  }

  async deny(
    id: string,
    clubUnitId: string,
    denierPersonId: string,
    reason: string,
  ): Promise<SpeechApproval> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.clubUnitId !== clubUnitId) {
      throw new NotFoundException('Approval not found');
    }
    if (existing.status !== 'requested') {
      throw new BadRequestException(`Approval already ${existing.status}`);
    }
    const updated = await this.repo.deny(id, denierPersonId, new Date(), reason);
    if (!updated) {
      const current = await this.repo.findById(id);
      throw new BadRequestException(
        current ? `Approval already ${current.status}` : 'Approval not found',
      );
    }
    return updated;
  }
}
