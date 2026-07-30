import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type {
  Person,
  PersonClubBadge,
  PersonDetail,
  PersonPendingInvitationSummary,
  PersonPlatformRoleBadge,
  PersonRoleBadge,
  PersonSearchResultItem,
  PersonStatus,
} from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type PersonRow = Awaited<ReturnType<PrismaClient['person']['create']>>;

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    photoUrl: row.photoUrl,
    bio: row.bio,
    tiMemberNumber: row.tiMemberNumber,
    status: row.status,
    mfaEnabled: row.mfaEnabled,
    permissionVersion: row.permissionVersion,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

@Injectable()
export class PersonRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    email: string;
    fullName: string;
    phone?: string | null;
    tiMemberNumber?: string | null;
  }): Promise<Person> {
    const row = await this.db.person.create({
      data: {
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        phone: input.phone ?? null,
        tiMemberNumber: input.tiMemberNumber ?? null,
      },
    });
    return toPerson(row);
  }

  async findById(id: string): Promise<Person | null> {
    const row = await this.db.person.findUnique({ where: { id } });
    return row ? toPerson(row) : null;
  }

  async findByEmail(email: string): Promise<Person | null> {
    const row = await this.db.person.findUnique({ where: { email: email.toLowerCase() } });
    return row ? toPerson(row) : null;
  }

  /**
   * The minimal seam a fixture (or, later, a self-service invite-acceptance
   * flow — not built in M1) uses to give a person a password. Flips status to
   * 'active': there is no separate activation step yet.
   */
  async setCredentials(personId: string, passwordHash: string): Promise<void> {
    await this.db.person.update({
      where: { id: personId },
      data: { passwordHash, status: 'active' },
    });
  }

  /** Narrow, login-only read — never exposes the hash outside this repository. */
  async findCredentialsByEmail(
    email: string,
  ): Promise<{ id: string; passwordHash: string | null; status: PersonStatus } | null> {
    return this.db.person.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, passwordHash: true, status: true },
    });
  }

  /** Users admin profile edit. Email is not updatable here — see updatePersonRequestSchema. */
  async update(
    id: string,
    changes: {
      fullName?: string;
      phone?: string | null;
      tiMemberNumber?: string | null;
      status?: 'active' | 'disabled';
    },
  ): Promise<Person> {
    const row = await this.db.person.update({
      where: { id },
      data: {
        fullName: changes.fullName,
        phone: changes.phone,
        tiMemberNumber: changes.tiMemberNumber,
        status: changes.status,
      },
    });
    return toPerson(row);
  }

  /**
   * Users admin detail/edit routes' guard against horizontal scope
   * escalation: the outer @ResourceScope only checks the actor holds
   * identity.person at the *anchor* org unit they passed — it says nothing
   * about which person id they asked for. A district-scoped unit_admin
   * anchoring at their own district could otherwise read or edit a person
   * who belongs only to a sibling district. Same three-facet EXISTS as
   * search()'s subtree filter, narrowed to a single person id.
   */
  async isWithinSubtree(personId: string, subtreePath: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<Array<{ found: number }>>`
      SELECT 1 AS found WHERE EXISTS (
        SELECT 1 FROM role_assignment ra JOIN org_unit ou ON ou.id = ra.org_unit_id
        WHERE ra.person_id = ${personId}::uuid AND ou.path <@ ${subtreePath}::ltree
        UNION ALL
        SELECT 1 FROM club_membership cm JOIN org_unit ou ON ou.id = cm.club_unit_id
        WHERE cm.person_id = ${personId}::uuid AND ou.path <@ ${subtreePath}::ltree
        UNION ALL
        SELECT 1 FROM platform_role_assignment pra JOIN org_unit ou ON ou.id = pra.org_unit_id
        WHERE pra.person_id = ${personId}::uuid AND ou.path <@ ${subtreePath}::ltree
      )
    `;
    return rows.length > 0;
  }

  /**
   * Users admin search/list. `isRegionRoot` callers (system_admin, or a
   * unit_admin scoped at the region root — only one exists, per
   * org_unit_single_region_root) see every person, including ones not yet
   * placed anywhere. Everyone else is filtered to people who hold at least
   * one role assignment, club membership or platform role inside their
   * subtree — a brand-new, unassigned Person has none of those, so a
   * district-scoped unit_admin correctly never sees a person who hasn't been
   * placed in their district yet.
   */
  async search(input: {
    subtreePath: string;
    isRegionRoot: boolean;
    q?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: PersonSearchResultItem[]; total: number }> {
    const needle = input.q?.trim() || null;

    const [rows, totalRows] = input.isRegionRoot
      ? await Promise.all([
          // $queryRaw does not apply Prisma's camelCase field mapping —
          // every column toPerson() reads back is aliased explicitly.
          this.db.$queryRaw<PersonRow[]>`
            SELECT id, email, full_name AS "fullName", phone, photo_url AS "photoUrl", bio,
                   ti_member_number AS "tiMemberNumber", status, mfa_enabled AS "mfaEnabled",
                   permission_version AS "permissionVersion", created_at AS "createdAt",
                   last_login_at AS "lastLoginAt"
            FROM person
            WHERE (${needle}::text IS NULL
              OR full_name ILIKE '%' || ${needle} || '%'
              OR email ILIKE '%' || ${needle} || '%'
              OR ti_member_number ILIKE '%' || ${needle} || '%')
            ORDER BY full_name ASC
            LIMIT ${input.limit} OFFSET ${input.offset}
          `,
          this.db.$queryRaw<Array<{ n: bigint }>>`
            SELECT count(*) AS n FROM person
            WHERE (${needle}::text IS NULL
              OR full_name ILIKE '%' || ${needle} || '%'
              OR email ILIKE '%' || ${needle} || '%'
              OR ti_member_number ILIKE '%' || ${needle} || '%')
          `,
        ])
      : await Promise.all([
          this.db.$queryRaw<PersonRow[]>`
            SELECT p.id, p.email, p.full_name AS "fullName", p.phone, p.photo_url AS "photoUrl", p.bio,
                   p.ti_member_number AS "tiMemberNumber", p.status, p.mfa_enabled AS "mfaEnabled",
                   p.permission_version AS "permissionVersion", p.created_at AS "createdAt",
                   p.last_login_at AS "lastLoginAt"
            FROM person p
            WHERE (${needle}::text IS NULL
              OR p.full_name ILIKE '%' || ${needle} || '%'
              OR p.email ILIKE '%' || ${needle} || '%'
              OR p.ti_member_number ILIKE '%' || ${needle} || '%')
              AND EXISTS (
                SELECT 1 FROM role_assignment ra JOIN org_unit ou ON ou.id = ra.org_unit_id
                WHERE ra.person_id = p.id AND ou.path <@ ${input.subtreePath}::ltree
                UNION ALL
                SELECT 1 FROM club_membership cm JOIN org_unit ou ON ou.id = cm.club_unit_id
                WHERE cm.person_id = p.id AND ou.path <@ ${input.subtreePath}::ltree
                UNION ALL
                SELECT 1 FROM platform_role_assignment pra JOIN org_unit ou ON ou.id = pra.org_unit_id
                WHERE pra.person_id = p.id AND ou.path <@ ${input.subtreePath}::ltree
              )
            ORDER BY p.full_name ASC
            LIMIT ${input.limit} OFFSET ${input.offset}
          `,
          this.db.$queryRaw<Array<{ n: bigint }>>`
            SELECT count(*) AS n FROM person p
            WHERE (${needle}::text IS NULL
              OR p.full_name ILIKE '%' || ${needle} || '%'
              OR p.email ILIKE '%' || ${needle} || '%'
              OR p.ti_member_number ILIKE '%' || ${needle} || '%')
              AND EXISTS (
                SELECT 1 FROM role_assignment ra JOIN org_unit ou ON ou.id = ra.org_unit_id
                WHERE ra.person_id = p.id AND ou.path <@ ${input.subtreePath}::ltree
                UNION ALL
                SELECT 1 FROM club_membership cm JOIN org_unit ou ON ou.id = cm.club_unit_id
                WHERE cm.person_id = p.id AND ou.path <@ ${input.subtreePath}::ltree
                UNION ALL
                SELECT 1 FROM platform_role_assignment pra JOIN org_unit ou ON ou.id = pra.org_unit_id
                WHERE pra.person_id = p.id AND ou.path <@ ${input.subtreePath}::ltree
              )
          `,
        ]);

    const personIds = rows.map((r) => r.id);
    const badges = await this.badgesForPersons(personIds);
    const items: PersonSearchResultItem[] = rows.map((row) => ({
      ...toPerson(row),
      clubMemberships: badges.clubByPerson.get(row.id) ?? [],
      roleAssignments: badges.roleByPerson.get(row.id) ?? [],
      platformRoles: badges.platformByPerson.get(row.id) ?? [],
      pendingInvitation: badges.pendingInvitationByEmail.get(row.email) ?? null,
    }));

    return { items, total: Number(totalRows[0]?.n ?? 0) };
  }

  async findDetail(id: string): Promise<PersonDetail | null> {
    const row = await this.db.person.findUnique({ where: { id } });
    if (!row) return null;

    const badges = await this.badgesForPersons([id], { includeEndedRoles: true });
    return {
      ...toPerson(row),
      clubMemberships: badges.clubByPerson.get(id) ?? [],
      roleAssignments: badges.roleByPerson.get(id) ?? [],
      platformRoles: badges.platformByPerson.get(id) ?? [],
      pendingInvitation: badges.pendingInvitationByEmail.get(row.email) ?? null,
    };
  }

  /**
   * Three grouped queries total regardless of how many person ids are
   * passed in, not N+1 — same convention as OrgUnitRepository.attachCounts.
   */
  private async badgesForPersons(
    personIds: string[],
    options: { includeEndedRoles?: boolean } = {},
  ): Promise<{
    roleByPerson: Map<string, PersonRoleBadge[]>;
    clubByPerson: Map<string, PersonClubBadge[]>;
    platformByPerson: Map<string, PersonPlatformRoleBadge[]>;
    pendingInvitationByEmail: Map<string, PersonPendingInvitationSummary>;
  }> {
    if (personIds.length === 0) {
      return {
        roleByPerson: new Map(),
        clubByPerson: new Map(),
        platformByPerson: new Map(),
        pendingInvitationByEmail: new Map(),
      };
    }

    const emails = (
      await this.db.person.findMany({ where: { id: { in: personIds } }, select: { email: true } })
    ).map((p) => p.email);

    type RoleRow = {
      role_assignment_id: string;
      person_id: string;
      role: string;
      org_unit_id: string;
      org_unit_name: string;
      org_unit_type: string;
      status: string;
    };
    const roleRowsPromise = options.includeEndedRoles
      ? this.db.$queryRaw<RoleRow[]>`
          SELECT ra.id AS role_assignment_id, ra.person_id, ra.role, ra.org_unit_id,
                 ou.name AS org_unit_name, ou.type AS org_unit_type, ra.status
          FROM role_assignment ra
          JOIN org_unit ou ON ou.id = ra.org_unit_id
          WHERE ra.person_id = ANY(${personIds}::uuid[])
          ORDER BY ra.appointed_at DESC
        `
      : this.db.$queryRaw<RoleRow[]>`
          SELECT ra.id AS role_assignment_id, ra.person_id, ra.role, ra.org_unit_id,
                 ou.name AS org_unit_name, ou.type AS org_unit_type, ra.status
          FROM role_assignment ra
          JOIN org_unit ou ON ou.id = ra.org_unit_id
          WHERE ra.person_id = ANY(${personIds}::uuid[]) AND ra.status = 'active'::"RoleAssignmentStatus"
          ORDER BY ra.appointed_at DESC
        `;

    const [roleRows, clubRows, platformRows, invitationRows] = await Promise.all([
      roleRowsPromise,
      this.db.$queryRaw<
        Array<{
          club_membership_id: string;
          person_id: string;
          club_unit_id: string;
          club_name: string;
          member_type: string;
          local_status: string;
        }>
      >`
        SELECT cm.id AS club_membership_id, cm.person_id, cm.club_unit_id,
               ou.name AS club_name, cm.member_type, cm.local_status
        FROM club_membership cm
        JOIN org_unit ou ON ou.id = cm.club_unit_id
        WHERE cm.person_id = ANY(${personIds}::uuid[]) AND cm.local_status = 'active'::"ClubMembershipLocalStatus"
        ORDER BY cm.joined_at DESC
      `,
      this.db.$queryRaw<
        Array<{
          platform_role_assignment_id: string;
          person_id: string;
          role: string;
          org_unit_id: string | null;
          org_unit_name: string | null;
        }>
      >`
        SELECT pra.id AS platform_role_assignment_id, pra.person_id, pra.role, pra.org_unit_id,
               ou.name AS org_unit_name
        FROM platform_role_assignment pra
        LEFT JOIN org_unit ou ON ou.id = pra.org_unit_id
        WHERE pra.person_id = ANY(${personIds}::uuid[])
        ORDER BY pra.granted_at DESC
      `,
      emails.length
        ? this.db.$queryRaw<
            Array<{
              id: string;
              email: string;
              org_unit_id: string;
              role: string;
              expires_at: Date;
              created_at: Date;
            }>
          >`
            SELECT DISTINCT ON (email) id, email, org_unit_id, role, expires_at, created_at
            FROM invitation
            WHERE email = ANY(${emails}::text[]) AND status = 'pending'::"InvitationStatus"
            ORDER BY email, created_at DESC
          `
        : Promise.resolve([]),
    ]);

    const roleByPerson = new Map<string, PersonRoleBadge[]>();
    for (const r of roleRows) {
      const list = roleByPerson.get(r.person_id) ?? [];
      list.push({
        roleAssignmentId: r.role_assignment_id,
        role: r.role,
        orgUnitId: r.org_unit_id,
        orgUnitName: r.org_unit_name,
        orgUnitType: r.org_unit_type as PersonRoleBadge['orgUnitType'],
        status: r.status as PersonRoleBadge['status'],
      });
      roleByPerson.set(r.person_id, list);
    }

    const clubByPerson = new Map<string, PersonClubBadge[]>();
    for (const c of clubRows) {
      const list = clubByPerson.get(c.person_id) ?? [];
      list.push({
        clubMembershipId: c.club_membership_id,
        clubUnitId: c.club_unit_id,
        clubName: c.club_name,
        memberType: c.member_type as PersonClubBadge['memberType'],
        localStatus: c.local_status as PersonClubBadge['localStatus'],
      });
      clubByPerson.set(c.person_id, list);
    }

    const platformByPerson = new Map<string, PersonPlatformRoleBadge[]>();
    for (const p of platformRows) {
      const list = platformByPerson.get(p.person_id) ?? [];
      list.push({
        platformRoleAssignmentId: p.platform_role_assignment_id,
        role: p.role,
        orgUnitId: p.org_unit_id,
        orgUnitName: p.org_unit_name,
      });
      platformByPerson.set(p.person_id, list);
    }

    const pendingInvitationByEmail = new Map<string, PersonPendingInvitationSummary>();
    for (const i of invitationRows) {
      pendingInvitationByEmail.set(i.email, {
        id: i.id,
        orgUnitId: i.org_unit_id,
        role: i.role,
        expiresAt: i.expires_at.toISOString(),
        createdAt: i.created_at.toISOString(),
      });
    }

    return { roleByPerson, clubByPerson, platformByPerson, pendingInvitationByEmail };
  }
}
