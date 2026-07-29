import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { AccessModule } from '../access/access.module';
import { EmailModule } from '../../common/email/email.module';
import { PasswordService } from '../../common/auth/password.service';
import { PersonRepository } from './person.repository';
import { ClubMembershipRepository } from './club-membership.repository';
import { ProgramYearRepository } from './program-year.repository';
import { RoleAssignmentRepository } from './role-assignment.repository';
import { InvitationRepository } from './invitation.repository';
import { InvitationRateLimiter } from './invitation-rate-limiter.service';
import { InvitationService } from './invitation.service';
import { IdentityController } from './identity.controller';
import { InvitationController } from './invitation.controller';
import { ClubMemberController } from './club-member.controller';

@Module({
  imports: [AccessModule, EmailModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    PersonRepository,
    ClubMembershipRepository,
    ProgramYearRepository,
    RoleAssignmentRepository,
    InvitationRepository,
    InvitationRateLimiter,
    InvitationService,
    // PasswordService also lives in AuthModule; importing AuthModule here
    // would cycle (AuthModule imports IdentityModule), so it's registered
    // again in this module instead — it's stateless, so a second instance
    // is harmless.
    PasswordService,
  ],
  controllers: [IdentityController, InvitationController, ClubMemberController],
  exports: [
    PersonRepository,
    ClubMembershipRepository,
    ProgramYearRepository,
    RoleAssignmentRepository,
  ],
})
export class IdentityModule {}
