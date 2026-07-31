import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createPersonRequestSchema,
  grantPlatformRoleRequestSchema,
  personSearchQuerySchema,
  setPersonPasswordRequestSchema,
  updatePersonRequestSchema,
  type CreatePersonRequest,
  type GrantPlatformRoleRequest,
  type InvitationWithLink,
  type OrgUnitAncestorsResponse,
  type Person,
  type PersonDetail,
  type PersonPlatformRoleBadge,
  type PersonSearchQuery,
  type PersonSearchResponse,
  type SetPersonPasswordRequest,
  type UpdatePersonRequest,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { Principal } from '../../common/authz/authz.types';
import { PersonService } from './person.service';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * Users admin (super-admin People page). Every route is anchored by an
 * org-unit id — a param for the subtree-listing/creating routes, a query
 * param for the by-id routes (there is no org unit in a person's own URL) —
 * exactly like PlatformConsoleController anchors on `regionUnitId`.
 */
@Controller()
export class PersonController {
  constructor(private readonly people: PersonService) {}

  @Get('org-units/:orgUnitId/people')
  @ResourceScope('identity.person', 'read', { source: 'param', key: 'orgUnitId' })
  async search(
    @Param('orgUnitId', uuidPipe) orgUnitId: string,
    @Query(new ZodValidationPipe(personSearchQuerySchema)) query: PersonSearchQuery,
  ): Promise<PersonSearchResponse> {
    return this.people.search({ anchorOrgUnitId: orgUnitId, ...query });
  }

  @Post('org-units/:orgUnitId/people')
  @ResourceScope('identity.person', 'create', { source: 'param', key: 'orgUnitId' })
  async create(
    @Param('orgUnitId', uuidPipe) _orgUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createPersonRequestSchema)) body: CreatePersonRequest,
  ): Promise<{ person: Person; invitation: InvitationWithLink | null }> {
    return this.people.createWithOptionalInvite({ actorId: principal.userId, request: body });
  }

  @Get('people/:personId')
  @ResourceScope('identity.person', 'read', { source: 'query', key: 'anchorOrgUnitId' })
  async detail(
    @Param('personId', uuidPipe) personId: string,
    @Query('anchorOrgUnitId', uuidPipe) anchorOrgUnitId: string,
  ): Promise<PersonDetail> {
    return this.people.getDetail(personId, anchorOrgUnitId);
  }

  @Patch('people/:personId')
  @ResourceScope('identity.person', 'update', { source: 'query', key: 'anchorOrgUnitId' })
  async update(
    @Param('personId', uuidPipe) personId: string,
    @Query('anchorOrgUnitId', uuidPipe) anchorOrgUnitId: string,
    @Body(new ZodValidationPipe(updatePersonRequestSchema)) body: UpdatePersonRequest,
  ): Promise<Person> {
    return this.people.update(personId, anchorOrgUnitId, body);
  }

  /**
   * Users admin password reset. `update` (not a separate action) — the six
   * fixed actions are read/create/update/approve/export/delete (CLAUDE.md
   * §5) and password reset is a credential-side "update" of the person.
   * Whoever can flip status to 'disabled' via PATCH can already lock the
   * user out, so the authorization surface is symmetric.
   */
  @Post('people/:personId/password')
  @HttpCode(204)
  @ResourceScope('identity.person', 'update', { source: 'query', key: 'anchorOrgUnitId' })
  async setPassword(
    @Param('personId', uuidPipe) personId: string,
    @Query('anchorOrgUnitId', uuidPipe) anchorOrgUnitId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(setPersonPasswordRequestSchema)) body: SetPersonPasswordRequest,
  ): Promise<void> {
    await this.people.setPassword(personId, anchorOrgUnitId, body.password, principal.userId);
  }

  /**
   * Users admin soft-delete. `identity.person:delete` is granted only to
   * system_admin (via the broad non-restricted synthesis) — no role
   * template's grant list includes it, so a district-scoped unit_admin
   * that can read/update people cannot delete them.
   */
  @Delete('people/:personId')
  @HttpCode(204)
  @ResourceScope('identity.person', 'delete', { source: 'query', key: 'anchorOrgUnitId' })
  async delete(
    @Param('personId', uuidPipe) personId: string,
    @Query('anchorOrgUnitId', uuidPipe) anchorOrgUnitId: string,
    @CurrentUser() principal: Principal,
  ): Promise<void> {
    await this.people.softDelete(personId, anchorOrgUnitId, principal.userId);
  }

  /**
   * Users admin "show disabled accounts" toggle's restore action. `update`,
   * not `delete` — reversing a soft-delete is the same tier as the PATCH
   * status flip, and whoever can disable/delete a person should be able to
   * undo it too.
   */
  @Post('people/:personId/restore')
  @ResourceScope('identity.person', 'update', { source: 'query', key: 'anchorOrgUnitId' })
  async restore(
    @Param('personId', uuidPipe) personId: string,
    @Query('anchorOrgUnitId', uuidPipe) anchorOrgUnitId: string,
    @CurrentUser() principal: Principal,
  ): Promise<Person> {
    return this.people.restore(personId, anchorOrgUnitId, principal.userId);
  }

  /** The Add User dialog's cascade picker: auto-populate the parents above a directly-picked unit. */
  @Get('org-units/:orgUnitId/ancestors')
  @ResourceScope('identity.person', 'read', { source: 'param', key: 'orgUnitId' })
  async ancestors(
    @Param('orgUnitId', uuidPipe) orgUnitId: string,
  ): Promise<OrgUnitAncestorsResponse> {
    return this.people.getAncestors(orgUnitId);
  }

  /**
   * Users admin: grant a platform role (system_admin / unit_admin /
   * support_readonly). No `@ResourceScope` — the URL is anchored on the
   * target person, not an org unit; PersonService.grantPlatformRole delegates
   * the real authority check to GrantAdminRepository's canDelegate guard
   * against the role's actual scope (rbac-design.md §7.4).
   */
  @Post('people/:personId/platform-roles')
  async grantPlatformRole(
    @Param('personId', uuidPipe) personId: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(grantPlatformRoleRequestSchema)) body: GrantPlatformRoleRequest,
  ): Promise<PersonPlatformRoleBadge> {
    return this.people.grantPlatformRole(personId, body, principal.userId);
  }

  /** Users admin: revoke a platform role. See grantPlatformRole()'s note on why there's no `@ResourceScope`. */
  @Delete('people/:personId/platform-roles/:platformRoleAssignmentId')
  @HttpCode(204)
  async revokePlatformRole(
    @Param('personId', uuidPipe) personId: string,
    @Param('platformRoleAssignmentId', uuidPipe) platformRoleAssignmentId: string,
    @CurrentUser() principal: Principal,
  ): Promise<void> {
    await this.people.revokePlatformRole(personId, platformRoleAssignmentId, principal.userId);
  }
}
