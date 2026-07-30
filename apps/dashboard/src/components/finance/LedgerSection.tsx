'use client';

import type { LedgerEntry } from '@toastmasters/contracts';
import { useLocalCollection } from '@/hooks/use-local-collection';
import { CreateLedgerEntryForm } from './CreateLedgerEntryForm';
import { LedgerEntriesList } from './LedgerEntriesList';

export function LedgerSection({
  clubUnitId,
  programYearId,
  initialEntries,
}: {
  clubUnitId: string;
  programYearId: string | null;
  initialEntries: LedgerEntry[];
}) {
  const { items, upsert } = useLocalCollection(initialEntries);

  return (
    <section className="flex flex-col gap-3">
      <h2>Ledger</h2>
      <CreateLedgerEntryForm
        clubUnitId={clubUnitId}
        programYearId={programYearId}
        onSaved={upsert}
      />
      <LedgerEntriesList clubUnitId={clubUnitId} entries={items} onSaved={upsert} />
    </section>
  );
}
