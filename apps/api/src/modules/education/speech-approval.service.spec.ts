import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { SpeechApproval } from '@toastmasters/contracts';
import { SpeechApprovalService } from './speech-approval.service';

const APPROVAL_ID = '11111111-1111-4111-8111-111111111111';
const CLUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VPE = 'ccccccccc-cccc-4ccc-8ccc-cccccccccccc'.slice(0, 36);
const SLOT_ID = '22222222-2222-4222-8222-222222222222';

function approval(overrides: Partial<SpeechApproval> = {}): SpeechApproval {
  return {
    id: APPROVAL_ID,
    speechSlotId: SLOT_ID,
    personId: VPE,
    clubUnitId: CLUB_A,
    pathCode: 'PM',
    projectCode: 'PM-ICE-BREAKER',
    level: 1,
    status: 'requested',
    requestedAt: '2026-01-15T18:00:00.000Z',
    approvedAt: null,
    approvedBy: null,
    deniedAt: null,
    deniedBy: null,
    denialReason: null,
    createdAt: '2026-01-15T18:00:00.000Z',
    ...overrides,
  };
}

function makeService(existing: SpeechApproval | null, updated: SpeechApproval | null = existing) {
  const repo = {
    findById: vi.fn().mockResolvedValue(existing),
    approve: vi
      .fn()
      .mockResolvedValue(updated ? { ...updated, status: 'approved' as const } : null),
    deny: vi.fn().mockResolvedValue(updated ? { ...updated, status: 'denied' as const } : null),
    listForClub: vi.fn(),
  };
  return { service: new SpeechApprovalService(repo as never), repo };
}

describe('SpeechApprovalService.approve', () => {
  it('flips the row from requested to approved', async () => {
    const { service, repo } = makeService(approval());
    const result = await service.approve(APPROVAL_ID, CLUB_A, VPE);
    expect(result.status).toBe('approved');
    expect(repo.approve).toHaveBeenCalledWith(APPROVAL_ID, VPE, expect.any(Date));
  });

  it('404s when the approval belongs to a different club — never leaks existence', async () => {
    // Wrong-scope: the URL says CLUB_A, the row is on CLUB_B. `authorize()`
    // already gated on CLUB_A, so a caller with a CLUB_A grant reaching a
    // CLUB_B approval means they guessed the id. Return 404 (not 403) so
    // the club membership of the approval stays hidden.
    const { service, repo } = makeService(approval({ clubUnitId: CLUB_B }));
    await expect(service.approve(APPROVAL_ID, CLUB_A, VPE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it('404s when the id resolves to nothing', async () => {
    const { service, repo } = makeService(null);
    await expect(service.approve(APPROVAL_ID, CLUB_A, VPE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it('rejects when the approval is already approved', async () => {
    const { service, repo } = makeService(approval({ status: 'approved' }));
    await expect(service.approve(APPROVAL_ID, CLUB_A, VPE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it('rejects when the approval is already denied', async () => {
    const { service, repo } = makeService(approval({ status: 'denied' }));
    await expect(service.approve(APPROVAL_ID, CLUB_A, VPE)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it('reports the concurrent winner when the atomic update loses the race', async () => {
    // Two VPEs click Approve at the same instant. findById sees `requested`,
    // the atomic `updateMany` matches nothing (another writer got there
    // first), and the second read now sees the winning state. Surface that
    // truthfully rather than pretend we won.
    const repo = {
      findById: vi
        .fn()
        .mockResolvedValueOnce(approval())
        .mockResolvedValueOnce(approval({ status: 'denied' })),
      approve: vi.fn().mockResolvedValue(null),
      deny: vi.fn(),
      listForClub: vi.fn(),
    };
    const service = new SpeechApprovalService(repo as never);
    await expect(service.approve(APPROVAL_ID, CLUB_A, VPE)).rejects.toThrow(/denied/);
  });
});

describe('SpeechApprovalService.deny', () => {
  it('flips the row from requested to denied and stores the reason', async () => {
    const { service, repo } = makeService(approval());
    const result = await service.deny(
      APPROVAL_ID,
      CLUB_A,
      VPE,
      'Not delivered against the project',
    );
    expect(result.status).toBe('denied');
    expect(repo.deny).toHaveBeenCalledWith(
      APPROVAL_ID,
      VPE,
      expect.any(Date),
      'Not delivered against the project',
    );
  });

  it('404s on cross-club id — same guard as approve', async () => {
    const { service } = makeService(approval({ clubUnitId: CLUB_B }));
    await expect(service.deny(APPROVAL_ID, CLUB_A, VPE, 'bad')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a re-deny of an already-decided row', async () => {
    const { service } = makeService(approval({ status: 'denied' }));
    await expect(service.deny(APPROVAL_ID, CLUB_A, VPE, 'x')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
