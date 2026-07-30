import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { CapabilityTokenService } from './capability-token.service';

function tokenRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'token-1',
    meetingId: 'meeting-1',
    purpose: 'guest-checkin',
    tokenHash: 'stored-hash',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    revokedAt: null,
    createdBy: 'officer-1',
    ...overrides,
  };
}

function makeService(
  overrides: {
    findByHashResult?: ReturnType<typeof tokenRow> | null;
  } = {},
) {
  const tokens = {
    create: vi
      .fn()
      .mockImplementation((input: Record<string, unknown>) =>
        Promise.resolve({ id: 'token-1', revokedAt: null, ...input }),
      ),
    revoke: vi.fn().mockResolvedValue(undefined),
    findByHash: vi
      .fn()
      .mockResolvedValue('findByHashResult' in overrides ? overrides.findByHashResult : tokenRow()),
  };

  const service = new CapabilityTokenService(tokens as never);
  return { service, tokens };
}

describe('CapabilityTokenService.issue', () => {
  it('hashes the raw token before persisting, and returns the raw token only to the caller', async () => {
    const { service, tokens } = makeService();

    const result = await service.issue({
      meetingId: 'meeting-1',
      purpose: 'guest-checkin',
      actorId: 'officer-1',
    });

    expect(tokens.create).toHaveBeenCalledTimes(1);
    const createArgs = tokens.create.mock.calls[0][0];
    expect(createArgs.tokenHash).toBe(createHash('sha256').update(result.token).digest('hex'));
    expect(createArgs.tokenHash).not.toBe(result.token);
    expect(createArgs.meetingId).toBe('meeting-1');
    expect(createArgs.purpose).toBe('guest-checkin');
    expect(createArgs.createdBy).toBe('officer-1');
  });

  it('defaults to a 240-minute TTL when none is given', async () => {
    const { service, tokens } = makeService();
    const before = Date.now();

    await service.issue({ meetingId: 'meeting-1', purpose: 'guest-checkin', actorId: 'officer-1' });

    const createArgs = tokens.create.mock.calls[0][0];
    const ttlMs = createArgs.expiresAt.getTime() - before;
    expect(ttlMs).toBeGreaterThan(239 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(240 * 60 * 1000 + 1000);
  });

  it('caps a requested TTL at the 720-minute maximum rather than trusting the caller', async () => {
    const { service, tokens } = makeService();
    const before = Date.now();

    await service.issue({
      meetingId: 'meeting-1',
      purpose: 'guest-checkin',
      ttlMinutes: 10_000,
      actorId: 'officer-1',
    });

    const createArgs = tokens.create.mock.calls[0][0];
    const ttlMs = createArgs.expiresAt.getTime() - before;
    expect(ttlMs).toBeLessThanOrEqual(720 * 60 * 1000 + 1000);
  });
});

describe('CapabilityTokenService.revoke', () => {
  it('delegates to the repository', async () => {
    const { service, tokens } = makeService();
    await service.revoke('token-1');
    expect(tokens.revoke).toHaveBeenCalledWith('token-1');
  });
});

describe('CapabilityTokenService.verify', () => {
  it('looks up the token by its hash, never the raw value', async () => {
    const { service, tokens } = makeService();
    await service.verify('raw-token-abc');
    expect(tokens.findByHash).toHaveBeenCalledWith(
      createHash('sha256').update('raw-token-abc').digest('hex'),
    );
  });

  it('is valid for a fresh, unrevoked token', async () => {
    const { service } = makeService({ findByHashResult: tokenRow() });
    const result = await service.verify('raw-token-abc');
    expect(result).toEqual({ valid: true, meetingId: 'meeting-1', purpose: 'guest-checkin' });
  });

  it('rejects an unknown token', async () => {
    const { service } = makeService({ findByHashResult: null });
    const result = await service.verify('unknown-token');
    expect(result).toEqual({ valid: false, meetingId: null, purpose: null });
  });

  it('rejects a revoked token even if not yet expired (revoked at meeting close)', async () => {
    const { service } = makeService({ findByHashResult: tokenRow({ revokedAt: new Date() }) });
    const result = await service.verify('raw-token-abc');
    expect(result.valid).toBe(false);
  });

  it('rejects an expired token even if not revoked', async () => {
    const { service } = makeService({
      findByHashResult: tokenRow({ expiresAt: new Date(Date.now() - 1000) }),
    });
    const result = await service.verify('raw-token-abc');
    expect(result.valid).toBe(false);
  });
});

describe('CapabilityTokenService.findValid', () => {
  it('returns the full row, including the issuing officer, for a valid token', async () => {
    const { service } = makeService({ findByHashResult: tokenRow() });
    const result = await service.findValid('raw-token-abc');
    expect(result).toEqual({
      id: 'token-1',
      meetingId: 'meeting-1',
      purpose: 'guest-checkin',
      createdBy: 'officer-1',
    });
  });

  it('returns null for a revoked token', async () => {
    const { service } = makeService({ findByHashResult: tokenRow({ revokedAt: new Date() }) });
    expect(await service.findValid('raw-token-abc')).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const { service } = makeService({
      findByHashResult: tokenRow({ expiresAt: new Date(Date.now() - 1000) }),
    });
    expect(await service.findValid('raw-token-abc')).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    const { service } = makeService({ findByHashResult: null });
    expect(await service.findValid('raw-token-abc')).toBeNull();
  });
});
