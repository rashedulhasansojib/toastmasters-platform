import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { AccessModule } from '../access/access.module';
import { OrgModule } from '../org/org.module';
import { EmailModule } from '../../common/email/email.module';
import { PasswordService } from '../../common/auth/password.service';
import { PersonRepository } from './person.repository';
import { ClubMembershipRepository } from './club-membership.repository';
import { ProgramYearRepository } from './program-year.repository';
import { RoleAssignmentRepository } from './role-assignment.repository';
import { RoleTemplateRepository } from './role-template.repository';
import { InvitationRepository } from './invitation.repository';
import { InvitationRateLimiter } from './invitation-rate-limiter.service';
import { InvitationService } from './invitation.service';
import { PersonService } from './person.service';
import { RoleAssignmentService } from './role-assignment.service';
import { IdentityController } from './identity.controller';
import { InvitationController } from './invitation.controller';
import { ClubMemberController } from './club-member.controller';
import { PersonController } from './person.controller';
import { RoleAssignmentController } from './role-assignment.controller';
import { RoleTemplateController } from './role-template.controller';
import { ProgramYearController } from './program-year.controller';

@Module({
  imports: [AccessModule, OrgModule, EmailModule],
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    PersonRepository,
    ClubMembershipRepository,
    ProgramYearRepository,
    RoleAssignmentRepository,
    RoleTemplateRepository,
    InvitationRepository,
    InvitationRateLimiter,
    InvitationService,
    PersonService,
    RoleAssignmentService,
    // PasswordService also lives in AuthModule; importing AuthModule here
    // would cycle (AuthModule imports IdentityModule), so it's registered
    // again in this module instead — it's stateless, so a second instance
    // is harmless.
    PasswordService,
  ],
  controllers: [
    IdentityController,
    InvitationController,
    ClubMemberController,
    PersonController,
    RoleAssignmentController,
    RoleTemplateController,
    ProgramYearController,
  ],
  exports: [
    PersonRepository,
    ClubMembershipRepository,
    ProgramYearRepository,
    RoleAssignmentRepository,
  ],
})
export class IdentityModule {}
