import { listMyTickets } from '@/lib/quality';
import { getSession } from '@/lib/session';
import { CreateTicketForm } from '@/components/quality/CreateTicketForm';
import { TicketsList } from '@/components/quality/TicketsList';

export default async function TicketsPage() {
  const [session, tickets] = await Promise.all([getSession(), listMyTickets()]);

  return (
    <main className="page flex flex-col gap-6">
      <h1>Tickets</h1>
      <section className="flex flex-col gap-3">
        <CreateTicketForm defaultScopeUnitId={session?.activeUnitId ?? null} />
        <TicketsList tickets={tickets} />
      </section>
    </main>
  );
}
