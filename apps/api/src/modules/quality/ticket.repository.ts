import { Inject, Injectable } from '@nestjs/common';
import { getPrisma, type PrismaClient } from '@toastmasters/db';
import type { Ticket, TicketComment, TicketParty, TicketSeverity } from '@toastmasters/contracts';
import { PRISMA_CLIENT } from '../../common/db/prisma-client.token';

type TicketRow = Awaited<ReturnType<PrismaClient['ticket']['create']>>;
type TicketCommentRow = Awaited<ReturnType<PrismaClient['ticketComment']['create']>>;

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    scopeUnitId: row.scopeUnitId,
    title: row.title,
    body: row.body,
    severity: row.severity,
    status: row.status,
    createdByPersonId: row.createdByPersonId,
    parties: row.parties as unknown as TicketParty[],
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolutionNote: row.resolutionNote,
    reopenedFromId: row.reopenedFromId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toTicketComment(row: TicketCommentRow): TicketComment {
  return {
    id: row.id,
    ticketId: row.ticketId,
    byPersonId: row.byPersonId,
    body: row.body,
    at: row.at.toISOString(),
  };
}

interface IdRow {
  id: string;
}

@Injectable()
export class TicketRepository {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PrismaClient = getPrisma()) {}

  async create(input: {
    scopeUnitId: string;
    title: string;
    body: string;
    severity: TicketSeverity;
    createdByPersonId: string;
    parties: TicketParty[];
  }): Promise<Ticket> {
    const row = await this.db.ticket.create({ data: input });
    return toTicket(row);
  }

  async findById(id: string): Promise<Ticket | null> {
    const row = await this.db.ticket.findUnique({ where: { id } });
    return row ? toTicket(row) : null;
  }

  /**
   * system-design.md §16.1: "visible to any principal holding read on
   * ticket whose scope path prefixes the ticket's scope path" — the coarse
   * @ResourceScope gate already authorized the caller's jurisdiction at
   * `orgUnitId`; this finds every ticket scoped at or beneath it. Raw SQL
   * only resolves matching ids (ltree has no Prisma query-builder support);
   * the actual rows come back through the typed client so field mapping
   * stays correct.
   */
  async findByJurisdiction(orgUnitId: string): Promise<Ticket[]> {
    const idRows = await this.db.$queryRaw<IdRow[]>`
      SELECT t.id FROM ticket t
      JOIN org_unit ou ON ou.id = t.scope_unit_id
      WHERE ou.path <@ (SELECT path FROM org_unit WHERE id = ${orgUnitId}::uuid)
    `;
    if (idRows.length === 0) return [];
    const rows = await this.db.ticket.findMany({
      where: { id: { in: idRows.map((r) => r.id) } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toTicket);
  }

  /** Creator ∪ tagged-person parties, independent of jurisdiction scope — the `party` condition's intent (system-design.md §16.1), enforced here at the query level rather than through the RBAC context gate (see the M6 plan doc's note on the pre-existing own/party context gap). */
  async findMine(personId: string): Promise<Ticket[]> {
    const idRows = await this.db.$queryRaw<IdRow[]>`
      SELECT id FROM ticket
      WHERE created_by_person_id = ${personId}::uuid
         OR parties @> ${JSON.stringify([{ kind: 'person', personId }])}::jsonb
    `;
    if (idRows.length === 0) return [];
    const rows = await this.db.ticket.findMany({
      where: { id: { in: idRows.map((r) => r.id) } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toTicket);
  }

  async setStatus(id: string, status: 'open' | 'active'): Promise<Ticket> {
    const row = await this.db.ticket.update({ where: { id }, data: { status } });
    return toTicket(row);
  }

  async resolve(id: string, resolvedBy: string, note: string): Promise<Ticket> {
    const row = await this.db.ticket.update({
      where: { id },
      data: { status: 'resolved', resolvedBy, resolvedAt: new Date(), resolutionNote: note },
    });
    return toTicket(row);
  }

  /** Reopening creates a linked successor — the resolved ticket itself is never edited (system-design.md §16.1). */
  async reopen(originalId: string): Promise<Ticket> {
    const original = await this.db.ticket.findUniqueOrThrow({ where: { id: originalId } });
    const row = await this.db.ticket.create({
      data: {
        scopeUnitId: original.scopeUnitId,
        title: original.title,
        body: original.body,
        severity: original.severity,
        createdByPersonId: original.createdByPersonId,
        parties: original.parties as never,
        reopenedFromId: original.id,
      },
    });
    return toTicket(row);
  }

  /** A comment on an `open` ticket moves it to `active` — a comment on an already-`resolved` ticket never silently reopens it. */
  async addComment(ticketId: string, byPersonId: string, body: string): Promise<TicketComment> {
    const row = await this.db.ticketComment.create({ data: { ticketId, byPersonId, body } });
    await this.db.ticket.updateMany({
      where: { id: ticketId, status: 'open' },
      data: { status: 'active' },
    });
    return toTicketComment(row);
  }

  async findComments(ticketId: string): Promise<TicketComment[]> {
    const rows = await this.db.ticketComment.findMany({
      where: { ticketId },
      orderBy: { at: 'asc' },
    });
    return rows.map(toTicketComment);
  }
}
