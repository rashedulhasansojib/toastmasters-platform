'use client';

import type { FinancialReport } from '@toastmasters/contracts';
import { useLocalCollection } from '@/hooks/use-local-collection';
import { GenerateReportForm } from './GenerateReportForm';
import { FinancialReportsList } from './FinancialReportsList';

export function FinancialReportsSection({
  clubUnitId,
  programYearId,
  initialReports,
}: {
  clubUnitId: string;
  programYearId: string | null;
  initialReports: FinancialReport[];
}) {
  const { items, upsert } = useLocalCollection(initialReports);

  return (
    <section className="flex flex-col gap-3">
      <h2>Financial reports</h2>
      <GenerateReportForm clubUnitId={clubUnitId} programYearId={programYearId} onSaved={upsert} />
      <FinancialReportsList clubUnitId={clubUnitId} reports={items} onSaved={upsert} />
    </section>
  );
}
