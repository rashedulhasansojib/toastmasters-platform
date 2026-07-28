import { Module } from '@nestjs/common';
import { getPrisma } from '@toastmasters/db';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';
import { PersonRepository } from './person.repository';
import { ClubMembershipRepository } from './club-membership.repository';
import { ProgramYearRepository } from './program-year.repository';
import { RoleAssignmentRepository } from './role-assignment.repository';

@Module({
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => getPrisma() },
    PersonRepository,
    ClubMembershipRepository,
    ProgramYearRepository,
    RoleAssignmentRepository,
  ],
  exports: [
    PersonRepository,
    ClubMembershipRepository,
    ProgramYearRepository,
    RoleAssignmentRepository,
  ],
})
export class IdentityModule {}
