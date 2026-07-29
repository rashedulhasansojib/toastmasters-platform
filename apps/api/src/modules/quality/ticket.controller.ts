import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
import type { Principal } from '../../common/authz/authz.types';
import { TicketRepository } from './ticket.repository';

const uuidPipe = new ZodValidationPipe(z.uuid());

/**
 * M6 Slice 5: system-design.md §16.1, FR-OVS-1. Flat `/tickets` surface
 * (not nested under `/clubs/:id`) since a ticket's scope can be any
 * org-tree unit — matches §20.2's literal API shape. `scope` is carried in
 * the query string for every route (including create) so the static
 * @ResourceScope decorator has something to authorize against; the body's
 * `scopeUnitId` must match it.
 */
@Controller('tickets')
export class TicketController {
  constructor(private readonly tickets: TicketRepository) {}

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
  async get(@Param('id', uuidPipe) id: string): Promise<Ticket> {
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw new BadRequestException('Ticket not found');
    return ticket;
  }

  @Get(':id/comments')
  comments(@Param('id', uuidPipe) id: string): Promise<TicketComment[]> {
    return this.tickets.findComments(id);
  }

  @Post(':id/comments')
  addComment(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(createTicketCommentRequestSchema))
    body: CreateTicketCommentRequest,
  ): Promise<TicketComment> {
    return this.tickets.addComment(id, principal.userId, body.body);
  }

  @Post(':id/resolve')
  resolve(
    @Param('id', uuidPipe) id: string,
    @CurrentUser() principal: Principal,
    @Body(new ZodValidationPipe(resolveTicketRequestSchema)) body: ResolveTicketRequest,
  ): Promise<Ticket> {
    return this.tickets.resolve(id, principal.userId, body.note);
  }

  @Post(':id/reopen')
  reopen(@Param('id', uuidPipe) id: string): Promise<Ticket> {
    return this.tickets.reopen(id);
  }
}
