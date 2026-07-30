'use client';

import type { Invoice } from '@toastmasters/contracts';
import { useLocalCollection } from '@/hooks/use-local-collection';
import { CreateInvoiceForm } from './CreateInvoiceForm';
import { InvoicesList } from './InvoicesList';

export function InvoicesSection({
  clubUnitId,
  programYearId,
  initialInvoices,
}: {
  clubUnitId: string;
  programYearId: string | null;
  initialInvoices: Invoice[];
}) {
  const { items, upsert } = useLocalCollection(initialInvoices);

  return (
    <section className="flex flex-col gap-3">
      <h2>Invoices</h2>
      <CreateInvoiceForm clubUnitId={clubUnitId} programYearId={programYearId} onSaved={upsert} />
      <InvoicesList clubUnitId={clubUnitId} invoices={items} onSaved={upsert} />
    </section>
  );
}
