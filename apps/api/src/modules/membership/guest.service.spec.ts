import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Guest } from '@toastmasters/contracts';
import { computeDeleteAfter, GUEST_RETENTION_DAYS, GuestService } from './guest.service';

function guest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'guest-1',
    orgUnitId: 'club-1',
    fullName: 'Casual Visitor',
    email: 'visitor@example.com',
    phone: null,
    whatsapp: null,
    photoUrl: null,
    bio: null,
    leadSource: null,
    preferredRole: null,
    pipelineStatus: 'new',
    convertedToPersonId: null,
    convertedAt: null,
    deleteAfter: new Date().toISOString(),
    createdBy: 'inviter-1',
    createdAt: new Date().toISOString(),
    piiRedactedAt: null,
    ...overrides,
  };
}

function makeService(overrides: { findByIdResult?: Guest | null } = {}) {
  const repository = {
    findById: vi
      .fn()
      .mockResolvedValue('findByIdResult' in overrides ? overrides.findByIdResult : guest()),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const service = new GuestService(repository as never);
  return { service, repository };
}

describe('computeDeleteAfter', () => {
  it('is exactly 180 days after the given instant (CLAUDE.md §2 decision 4)', () => {
    expect(GUEST_RETENTION_DAYS).toBe(180);
    const from = new Date('2026-07-29T00:00:00.000Z');
    const result = computeDeleteAfter(from);
    expect(result.toISOString()).toBe('2027-01-25T00:00:00.000Z');
  });

  it('carries across a year boundary correctly', () => {
    const from = new Date('2026-12-01T12:00:00.000Z');
    const result = computeDeleteAfter(from);
    expect(result.getUTCFullYear()).toBe(2027);
    expect(result > from).toBe(true);
  });

  it('does not mutate the input date', () => {
    const from = new Date('2026-07-29T00:00:00.000Z');
    const original = from.toISOString();
    computeDeleteAfter(from);
    expect(from.toISOString()).toBe(original);
  });
});

describe('GuestService.remove', () => {
  it('deletes a not-yet-converted guest', async () => {
    const { service, repository } = makeService();

    await service.remove('guest-1');

    expect(repository.remove).toHaveBeenCalledWith('guest-1');
  });

  it('rejects a guest that has already converted to a member', async () => {
    const { service, repository } = makeService({
      findByIdResult: guest({ pipelineStatus: 'joined', convertedToPersonId: 'person-9' }),
    });

    await expect(service.remove('guest-1')).rejects.toThrow(ConflictException);
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('404s when the guest does not exist', async () => {
    const { service, repository } = makeService({ findByIdResult: null });

    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    expect(repository.remove).not.toHaveBeenCalled();
  });
});
