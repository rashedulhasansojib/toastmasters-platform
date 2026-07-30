import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Invitation, ProgramYear } from '@toastmasters/contracts';
import type { Grant } from '../../common/authz/authz.types';
import { InvitationService } from './invitation.service';

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'invitation-1',
    email: 'newcomer@example.com',
    orgUnitId: 'club-1',
    role: 'club_president',
    memberType: null,
    programYearId: '2026-2027',
    invitedBy: 'inviter-1',
    status: 'pending',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    acceptedPersonId: null,
    ...overrides,
  };
}

function programYear(overrides: Partial<ProgramYear> = {}): ProgramYear {
  return {
    id: '2026-2027',
    startsOn: '2026-07-01',
    endsOn: '2027-06-30',
    status: 'current',
    ...overrides,
  };
}

function grant(overrides: Partial<Grant> = {}): Grant {
  return {
    role: 'unit_admin',
    scope: 'r1.d41.c1',
    resource: 'identity.role_assignment',
    action: 'create',
    condition: 'any',
    effect: 'allow',
    ...overrides,
  };
}

function makeService(
  overrides: {
    actorGrants?: Grant[];
    scope?: string;
    createResult?: Invitation;
    findByTokenHashResult?: Invitation | null;
    currentProgramYear?: ProgramYear | null;
  } = {},
) {
  const invitations = {
    create: vi.fn().mockResolvedValue(overrides.createResult ?? invitation()),
    findByTokenHash: vi
      .fn()
      .mockResolvedValue(
        'findByTokenHashResult' in overrides ? overrides.findByTokenHashResult : invitation(),
      ),
    accept: vi.fn().mockResolvedValue({ personId: 'person-1' }),
  };
  const programYears = {
    findById: vi.fn().mockResolvedValue(overrides.currentProgramYear ?? programYear()),
  };
  const accessRepository = {
    effectiveGrants: vi.fn().mockResolvedValue(overrides.actorGrants ?? [grant()]),
    pathOf: vi.fn().mockResolvedValue(overrides.scope ?? 'r1.d41.c1'),
  };
  const rateLimiter = { checkAndIncrement: vi.fn().mockResolvedValue(undefined) };
  const email = { send: vi.fn().mockResolvedValue(undefined) };
  const passwords = { hash: vi.fn().mockResolvedValue('hashed-password') };
  const env = { APP_URL: 'http://localhost:3000' };

  const service = new InvitationService(
    invitations as never,
    programYears as never,
    accessRepository as never,
    rateLimiter as never,
    email as never,
    passwords as never,
    env as never,
  );
  return { service, invitations, programYears, accessRepository, rateLimiter, email, passwords };
}

describe('InvitationService.create', () => {
  it('mints and persists an invitation, and emails the link, when the actor can delegate the role', async () => {
    const { service, invitations, email, rateLimiter } = makeService();

    const result = await service.create({
      actorId: 'inviter-1',
      orgUnitId: 'club-1',
      email: 'newcomer@example.com',
      role: 'club_president',
      programYearId: '2026-2027',
    });

    expect(rateLimiter.checkAndIncrement).toHaveBeenCalledWith('inviter-1');
    expect(invitations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newcomer@example.com',
        orgUnitId: 'club-1',
        role: 'club_president',
        programYearId: '2026-2027',
        invitedBy: 'inviter-1',
      }),
    );
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'newcomer@example.com' }),
    );
    expect(result.email).toBe('newcomer@example.com');
  });

  it('rejects, before any write, an actor who does not hold the grant being delegated', async () => {
    const { service, invitations, email } = makeService({
      actorGrants: [grant({ resource: 'meeting.meeting', action: 'read' })], // no identity.role_assignment:create
    });

    await expect(
      service.create({
        actorId: 'inviter-1',
        orgUnitId: 'club-1',
        email: 'newcomer@example.com',
        role: 'club_president',
        programYearId: '2026-2027',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(invitations.create).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('rejects an actor who holds the grant only at a different scope', async () => {
    const { service, invitations } = makeService({
      actorGrants: [grant({ scope: 'r1.d41.c9' })],
      scope: 'r1.d41.c1',
    });

    await expect(
      service.create({
        actorId: 'inviter-1',
        orgUnitId: 'club-1',
        email: 'newcomer@example.com',
        role: 'club_president',
        programYearId: '2026-2027',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(invitations.create).not.toHaveBeenCalled();
  });
});

describe('InvitationService.accept', () => {
  it('resolves the program year term dates, hashes the password, and calls accept()', async () => {
    const { service, invitations, programYears, passwords } = makeService();

    const result = await service.accept('raw-token', {
      fullName: 'Newcomer Person',
      password: 'a-real-password',
    });

    expect(passwords.hash).toHaveBeenCalledWith('a-real-password');
    expect(programYears.findById).toHaveBeenCalledWith('2026-2027');
    expect(invitations.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Newcomer Person',
        passwordHash: 'hashed-password',
        termStart: new Date('2026-07-01'),
        termEnd: new Date('2027-06-30'),
      }),
    );
    expect(result).toEqual({ personId: 'person-1' });
  });

  it('rejects an unknown token with a generic message', async () => {
    const { service } = makeService({ findByTokenHashResult: null });
    await expect(
      service.accept('bad-token', { fullName: 'X', password: 'whatever1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token with the same generic message', async () => {
    const { service } = makeService({
      findByTokenHashResult: invitation({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    });
    await expect(
      service.accept('expired-token', { fullName: 'X', password: 'whatever1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an already-accepted token with the same generic message', async () => {
    const { service } = makeService({
      findByTokenHashResult: invitation({ status: 'accepted' }),
    });
    await expect(
      service.accept('used-token', { fullName: 'X', password: 'whatever1' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
