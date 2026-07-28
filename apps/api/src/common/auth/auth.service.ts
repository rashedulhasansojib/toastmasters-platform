import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Person, SessionResponse } from '@toastmasters/contracts';
import { PersonRepository } from '../../modules/identity/person.repository';
import { ClubMembershipRepository } from '../../modules/identity/club-membership.repository';
import { ProgramYearRepository } from '../../modules/identity/program-year.repository';
import { OrgUnitRepository } from '../../modules/org/org.repository';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import type { SessionClaims } from './session.types';
import type { Principal } from '../authz/authz.types';

function toSessionResponse(person: Person, claims: SessionClaims): SessionResponse {
  return {
    personId: person.id,
    fullName: person.fullName,
    activeUnitId: claims.activeUnitId,
    programYearId: claims.programYearId,
  };
}

/**
 * Login + unit switching (Slice 8). `activeUnitId` is a UI convenience, never
 * an authorization boundary — authorize() always checks the real target
 * scope, never the session's activeUnitId (see the Slice 8 plan's scoping
 * note).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly people: PersonRepository,
    private readonly clubMemberships: ClubMembershipRepository,
    private readonly programYears: ProgramYearRepository,
    private readonly orgUnits: OrgUnitRepository,
    private readonly passwords: PasswordService,
    private readonly session: SessionService,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; session: SessionResponse }> {
    const credentials = await this.people.findCredentialsByEmail(email);
    if (!credentials || !credentials.passwordHash || credentials.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await this.passwords.verify(credentials.passwordHash, password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const [person, memberships, currentYear] = await Promise.all([
      this.people.findById(credentials.id),
      this.clubMemberships.findByPerson(credentials.id),
      this.programYears.findCurrent(),
    ]);
    if (!person) throw new UnauthorizedException('Invalid credentials');

    const primary = memberships.find((m) => m.isPrimary && !m.leftAt);
    const claims: SessionClaims = {
      sub: person.id,
      activeUnitId: primary?.clubUnitId ?? null,
      programYearId: currentYear?.id ?? null,
      v: person.permissionVersion,
    };
    const token = await this.session.issue(claims);
    return { token, session: toSessionResponse(person, claims) };
  }

  /** Reissues the session with only `activeUnitId` changed — `v`/`programYearId` carry forward from the current session, not re-fetched. */
  async switchUnit(
    principal: Principal,
    orgUnitId: string,
  ): Promise<{ token: string; session: SessionResponse }> {
    const [unit, person] = await Promise.all([
      this.orgUnits.findById(orgUnitId),
      this.people.findById(principal.userId),
    ]);
    if (!unit) throw new NotFoundException('Org unit not found');
    if (!person) throw new UnauthorizedException('Invalid session');

    const claims: SessionClaims = {
      sub: principal.userId,
      activeUnitId: unit.id,
      programYearId: principal.programYearId ?? null,
      v: principal.v ?? person.permissionVersion,
    };
    const token = await this.session.issue(claims);
    return { token, session: toSessionResponse(person, claims) };
  }
}
