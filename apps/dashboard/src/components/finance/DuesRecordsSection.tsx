'use client';

import type { ClubDuesSettings, DuesRecord } from '@toastmasters/contracts';
import { useLocalCollection } from '@/hooks/use-local-collection';
import { DuesSettingsForm } from './DuesSettingsForm';
import { GenerateDuesRecordsForm } from './GenerateDuesRecordsForm';
import { DuesRecordsList } from './DuesRecordsList';

export function DuesRecordsSection({
  clubUnitId,
  programYearId,
  settings,
  initialRecords,
}: {
  clubUnitId: string;
  programYearId: string | null;
  settings: ClubDuesSettings | null;
  initialRecords: DuesRecord[];
}) {
  const { items, upsert, upsertMany } = useLocalCollection(initialRecords);

  return (
    <section className="flex flex-col gap-3">
      <h2>Dues</h2>
      <DuesSettingsForm clubUnitId={clubUnitId} settings={settings} />
      <GenerateDuesRecordsForm
        clubUnitId={clubUnitId}
        programYearId={programYearId}
        onGenerated={upsertMany}
      />
      <DuesRecordsList clubUnitId={clubUnitId} records={items} onSaved={upsert} />
    </section>
  );
}
