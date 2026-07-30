import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createPersonRequestSchema,
  personSearchQuerySchema,
  updatePersonRequestSchema,
  type CreatePersonRequest,
  type InvitationWithLink,
  type OrgUnitAncestorsResponse,
  type Person,
  type PersonDetail,
  type PersonSearchQuery,
  type PersonSearchResponse,
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

  /** The Add User dialog's cascade picker: auto-populate the parents above a directly-picked unit. */
  @Get('org-units/:orgUnitId/ancestors')
  @ResourceScope('identity.person', 'read', { source: 'param', key: 'orgUnitId' })
  async ancestors(
    @Param('orgUnitId', uuidPipe) orgUnitId: string,
  ): Promise<OrgUnitAncestorsResponse> {
    return this.people.getAncestors(orgUnitId);
  }
}
