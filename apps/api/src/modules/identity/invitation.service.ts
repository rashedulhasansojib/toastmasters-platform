import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Env } from '@toastmasters/config';
import type { Invitation } from '@toastmasters/contracts';
import { canDelegate } from '../../common/authz/can-delegate';
import { AccessRepository } from '../access/access.repository';
import { EMAIL_PORT, type EmailPort } from '../../common/email/email.port';
import { ENV } from '../../config/config.module';
import { PasswordService } from '../../common/auth/password.service';
import { ProgramYearRepository } from './program-year.repository';
import { InvitationRepository } from './invitation.repository';
import { InvitationRateLimiter } from './invitation-rate-limiter.service';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // system-design.md §6.4: 7 days

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * M2 Slice 1: system-design.md §6.3/§6.4. `create()` is the outer
 * @ResourceScope('identity.invitation','create',...) route's business logic
 * plus the FR-ACC-5 delegation check on the specific role being invited —
 * distinct from the route guard, and load-bearing whenever a caller holds
 * identity.invitation:create without also holding identity.role_assignment:
 * create at that scope (see the Slice 1 plan's escalation-test note).
 */
@Injectable()
export class InvitationService {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly programYears: ProgramYearRepository,
    private readonly accessRepository: AccessRepository,
    private readonly rateLimiter: InvitationRateLimiter,
    @Inject(EMAIL_PORT) private readonly email: EmailPort,
    private readonly passwords: PasswordService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(input: {
    actorId: string;
    orgUnitId: string;
    email: string;
    role: string;
    programYearId: string;
  }): Promise<Invitation> {
    await this.rateLimiter.checkAndIncrement(input.actorId);

    const [actorGrants, scope] = await Promise.all([
      this.accessRepository.effectiveGrants(input.actorId),
      this.accessRepository.pathOf(input.orgUnitId),
    ]);
    if (
      !canDelegate(actorGrants, { resource: 'identity.role_assignment', action: 'create', scope })
    ) {
      throw new ForbiddenException(
        'Cannot invite into a role you do not hold the authority to assign',
      );
    }

    const rawToken = randomBytes(32).toString('base64url');
    const invitation = await this.invitations.create({
      email: input.email,
      tokenHash: hashToken(rawToken),
      orgUnitId: input.orgUnitId,
      role: input.role,
      programYearId: input.programYearId,
      invitedBy: input.actorId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });

    await this.email.send({
      to: input.email,
      subject: 'You have been invited to Toastmasters Portal',
      text: `Accept your invitation: ${this.env.APP_URL}/invitations/${rawToken}/accept`,
    });

    return invitation;
  }

  async accept(
    rawToken: string,
    input: { fullName: string; password: string },
  ): Promise<{ personId: string }> {
    const tokenHash = hashToken(rawToken);
    const invitation = await this.invitations.findByTokenHash(tokenHash);
    if (
      !invitation ||
      invitation.status !== 'pending' ||
      new Date(invitation.expiresAt) < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired invitation');
    }
    const programYear = await this.programYears.findById(invitation.programYearId);
    if (!programYear) throw new UnauthorizedException('Invalid or expired invitation');

    const passwordHash = await this.passwords.hash(input.password);
    return this.invitations.accept({
      tokenHash,
      fullName: input.fullName,
      passwordHash,
      termStart: new Date(programYear.startsOn),
      termEnd: new Date(programYear.endsOn),
    });
  }
}
