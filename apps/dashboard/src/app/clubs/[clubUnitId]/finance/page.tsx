import {
  listLedgerEntries,
  getClubDuesSettings,
  listDuesRecords,
  listInvoices,
  listInstallmentPlans,
  listFinancialReports,
} from '@/lib/finance';
import { getSession } from '@/lib/session';
import { LedgerSection } from '@/components/finance/LedgerSection';
import { DuesRecordsSection } from '@/components/finance/DuesRecordsSection';
import { InvoicesSection } from '@/components/finance/InvoicesSection';
import { InstallmentPlansSection } from '@/components/finance/InstallmentPlansSection';
import { FinancialReportsSection } from '@/components/finance/FinancialReportsSection';

export default async function ClubFinancePage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const [session, ledgerEntries, duesSettings, duesRecords, invoices, installmentPlans, reports] =
    await Promise.all([
      getSession(),
      listLedgerEntries(clubUnitId),
      getClubDuesSettings(clubUnitId),
      listDuesRecords(clubUnitId),
      listInvoices(clubUnitId),
      listInstallmentPlans(clubUnitId),
      listFinancialReports(clubUnitId),
    ]);
  const programYearId = session?.programYearId ?? null;

  return (
    <main className="page flex flex-col gap-6">
      <h1>Finance</h1>

      <LedgerSection
        clubUnitId={clubUnitId}
        programYearId={programYearId}
        initialEntries={ledgerEntries}
      />

      <DuesRecordsSection
        clubUnitId={clubUnitId}
        programYearId={programYearId}
        settings={duesSettings}
        initialRecords={duesRecords}
      />

      <InvoicesSection
        clubUnitId={clubUnitId}
        programYearId={programYearId}
        initialInvoices={invoices}
      />

      <InstallmentPlansSection clubUnitId={clubUnitId} initialPlans={installmentPlans} />

      <FinancialReportsSection
        clubUnitId={clubUnitId}
        programYearId={programYearId}
        initialReports={reports}
      />
    </main>
  );
}
