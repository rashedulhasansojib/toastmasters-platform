import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type {
  ActiveUnitSummary,
  ClubMembership,
  Person,
  SessionResponse,
  SwitchableUnit,
} from '@toastmasters/contracts';
import { PersonRepository } from '../../modules/identity/person.repository';
import { ClubMembershipRepository } from '../../modules/identity/club-membership.repository';
import { ProgramYearRepository } from '../../modules/identity/program-year.repository';
import { RoleAssignmentRepository } from '../../modules/identity/role-assignment.repository';
import { OrgUnitRepository } from '../../modules/org/org.repository';
import { GrantAdminRepository } from '../../modules/access/grant-admin.repository';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import type { SessionClaims } from './session.types';
import type { Principal } from '../authz/authz.types';

function toSessionResponse(
  person: Person,
  claims: SessionClaims,
  activeUnit: ActiveUnitSummary | null,
): SessionResponse {
  return {
    personId: person.id,
    fullName: person.fullName,
    activeUnitId: claims.activeUnitId,
    activeUnit,
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
    private readonly roleAssignments: RoleAssignmentRepository,
    private readonly grantAdmin: GrantAdminRepository,
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

    const activeUnit = await this.defaultActiveUnit(person.id, memberships);
    const claims: SessionClaims = {
      sub: person.id,
      activeUnitId: activeUnit?.id ?? null,
      programYearId: currentYear?.id ?? null,
      v: person.permissionVersion,
    };
    const token = await this.session.issue(claims);
    return { token, session: toSessionResponse(person, claims, activeUnit) };
  }

  /**
   * The public sandbox-signup endpoint (platform dashboard QR/link). Creates
   * a Person with no ClubMembership/RoleAssignment — `defaultActiveUnit`
   * would resolve the same null this hardcodes, since there is nothing to
   * find, so the session issued here is a completely ordinary one. The
   * sandbox module (not this service) is what recognises "no unit at all"
   * and serves the sandboxed dashboard.
   */
  async register(input: {
    email: string;
    fullName: string;
    password: string;
  }): Promise<{ token: string; session: SessionResponse }> {
    const person = await this.people.create({
      email: input.email,
      fullName: input.fullName,
      registrationSource: 'demo_signup',
    });
    const passwordHash = await this.passwords.hash(input.password);
    await this.people.setCredentials(person.id, passwordHash);

    const currentYear = await this.programYears.findCurrent();
    const claims: SessionClaims = {
      sub: person.id,
      activeUnitId: null,
      programYearId: currentYear?.id ?? null,
      v: person.permissionVersion,
    };
    const token = await this.session.issue(claims);
    return { token, session: toSessionResponse(person, claims, null) };
  }

  /**
   * The unit the dashboard opens on, so nobody has to pick one by hand: the
   * primary club membership, else any club they are still a member of, else
   * the first club they hold a role at (an officer or admin appointed
   * straight into a club, with no membership row). Null leaves the switcher
   * on "Select a unit…" — the only case is a person with no club at all,
   * e.g. an Area Director.
   */
  private async defaultActiveUnit(
    personId: string,
    memberships: ClubMembership[],
  ): Promise<ActiveUnitSummary | null> {
    const membershipClubId = (
      memberships.find((m) => m.isPrimary && !m.leftAt) ?? memberships.find((m) => !m.leftAt)
    )?.clubUnitId;
    if (membershipClubId) return this.resolveUnit(membershipClubId);

    const units = await this.unitsForPerson(personId);
    const club = units.find((unit) => unit.type === 'club');
    return club ? { id: club.id, name: club.name, type: club.type } : null;
  }

  /** A missing unit resolves to null rather than throwing — `activeUnitId` is a UI hint, and a deleted unit should not lock anyone out of the session. */
  private async resolveUnit(orgUnitId: string): Promise<ActiveUnitSummary | null> {
    const unit = await this.orgUnits.findById(orgUnitId);
    return unit ? { id: unit.id, name: unit.name, type: unit.type } : null;
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
    return {
      token,
      session: toSessionResponse(person, claims, {
        id: unit.id,
        name: unit.name,
        type: unit.type,
      }),
    };
  }

  /** A pure read — no cookie is (re)issued. Slice 6 (M2): the unit switcher's "who am I" query. */
  async me(principal: Principal): Promise<SessionResponse> {
    const person = await this.people.findById(principal.userId);
    if (!person) throw new UnauthorizedException('Invalid session');
    const activeUnitId = principal.activeUnitId ?? null;
    return toSessionResponse(
      person,
      {
        sub: principal.userId,
        activeUnitId,
        programYearId: principal.programYearId ?? null,
        v: principal.v ?? person.permissionVersion,
      },
      activeUnitId ? await this.resolveUnit(activeUnitId) : null,
    );
  }

  /**
   * Slice 6 (M2): candidate units for the switcher — places the person was
   * actually appointed to (an active RoleAssignment, or a PlatformRoleAssignment
   * bound to a specific unit), not a scope-prefix walk over everything
   * effectiveGrants would technically cover.
   */
  async switchableUnits(principal: Principal): Promise<SwitchableUnit[]> {
    return this.unitsForPerson(principal.userId);
  }

  private async unitsForPerson(personId: string): Promise<SwitchableUnit[]> {
    const [roleUnitIds, platformUnitIds] = await Promise.all([
      this.roleAssignments.findActiveOrgUnitIdsForPerson(personId),
      this.grantAdmin.findPlatformRoleOrgUnitIdsForPerson(personId),
    ]);
    const unitIds = [...new Set([...roleUnitIds, ...platformUnitIds])];
    const units = await this.orgUnits.findByIds(unitIds);
    return units.map((u) => ({ id: u.id, name: u.name, type: u.type, path: u.path }));
  }
}
