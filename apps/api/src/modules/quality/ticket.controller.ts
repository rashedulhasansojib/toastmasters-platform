import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createTicketRequestSchema,
  createTicketCommentRequestSchema,
  resolveTicketRequestSchema,
  type CreateTicketRequest,
  type CreateTicketCommentRequest,
  type ResolveTicketRequest,
  type Ticket,
  type TicketComment,
} from '@toastmasters/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResourceScope } from '../../common/authz/resource-scope.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthzService } from '../../common/authz/authz.service';
import type { Action, Principal } from '../../common/authz/authz.types';
import { TicketRepository } from './ticket.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M6 Slice 5: system-design.md §16.1, FR-OVS-1. Flat `/tickets` surface
 * (not nested under `/clubs/:id`) since a ticket's scope can be any
 * org-tree unit — matches §20.2's literal API shape.
 *
 * Create/list carry `?scope=` so `@ResourceScope` can gate them statically.
 * `:id`-keyed routes have no static scope — the guard sees only the ticket
 * id, so the handler resolves the ticket's own `scopeUnitId` and runs the
 * check through `AuthzService` directly.
 */
@Controller('tickets')
export class TicketController {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly authz: AuthzService,
  ) {}

  @Post()
  @ResourceScope('quality.ticket', 'create', { source: 'query', key: 'scope' })
  create(
    @Query('scope', uuidPipe) scope: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createTicketRequestSchema)) body: CreateTicketRequest,
  ): Promise<Ticket> {
    if (body.scopeUnitId !== scope) {
      throw new BadRequestException('scopeUnitId must match the ?scope= query param');
    }
    return this.tickets.create({
      scopeUnitId: body.scopeUnitId,
      title: body.title,
      body: body.body,
      severity: body.severity,
      createdByPersonId: principal.userId,
      parties: body.parties,
    });
  }

  @Get()
  @ResourceScope('quality.ticket', 'read', { source: 'query', key: 'scope' })
  list(@Query('scope', uuidPipe) scope: string): Promise<Ticket[]> {
    return this.tickets.findByJurisdiction(scope);
  }

  @Get('mine')
  mine(@CurrentUser() principal: Principal): Promise<Ticket[]> {
    return this.tickets.findMine(principal.userId);
  }

  @Get(':id')
  async get(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
  ): Promise<Ticket> {
    await this.authorizeOnTicket(id, principal, 'read');
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  @Get(':id/comments')
  async comments(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
  ): Promise<TicketComment[]> {
    await this.authorizeOnTicket(id, principal, 'read');
    return this.tickets.findComments(id);
  }

  @Post(':id/comments')
  async addComment(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createTicketCommentRequestSchema))
    body: CreateTicketCommentRequest,
  ): Promise<TicketComment> {
    await this.authorizeOnTicket(id, principal, 'update');
    return this.tickets.addComment(id, principal.userId, body.body);
  }

  @Post(':id/resolve')
  async resolve(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(resolveTicketRequestSchema)) body: ResolveTicketRequest,
  ): Promise<Ticket> {
    await this.authorizeOnTicket(id, principal, 'update');
    return this.tickets.resolve(id, principal.userId, body.note);
  }

  @Post(':id/reopen')
  async reopen(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
  ): Promise<Ticket> {
    await this.authorizeOnTicket(id, principal, 'update');
    return this.tickets.reopen(id);
  }

  /**
   * Resolves the ticket's own scope and runs it through `authorize()`. A
   * missing ticket returns 404 rather than 403 — the resource is `normal`
   * sensitivity, not restricted, so leaking existence is acceptable.
   */
  private async authorizeOnTicket(id: string, principal: Principal, action: Action): Promise<void> {
    const scopeUnitId = await this.tickets.findScopeUnitId(id);
    if (!scopeUnitId) throw new NotFoundException('Ticket not found');
    const scope = await this.authz.resolveScope(scopeUnitId);
    const decision = await this.authz.authorize({
      principal,
      resource: 'quality.ticket',
      action,
      scope,
    });
    if (!decision.allowed) {
      throw new ForbiddenException(`Access denied (${decision.reason})`);
    }
  }
}
