import {
  listLedgerEntries,
  getClubDuesSettings,
  listDuesRecords,
  listInvoices,
  listInstallmentPlans,
  listFinancialReports,
} from '@/lib/finance';
import { getSession } from '@/lib/session';
import { CreateLedgerEntryForm } from '@/components/finance/CreateLedgerEntryForm';
import { LedgerEntriesList } from '@/components/finance/LedgerEntriesList';
import { DuesSettingsForm } from '@/components/finance/DuesSettingsForm';
import { GenerateDuesRecordsForm } from '@/components/finance/GenerateDuesRecordsForm';
import { DuesRecordsList } from '@/components/finance/DuesRecordsList';
import { CreateInvoiceForm } from '@/components/finance/CreateInvoiceForm';
import { InvoicesList } from '@/components/finance/InvoicesList';
import { CreateInstallmentPlanForm } from '@/components/finance/CreateInstallmentPlanForm';
import { InstallmentPlansList } from '@/components/finance/InstallmentPlansList';
import { GenerateReportForm } from '@/components/finance/GenerateReportForm';
import { FinancialReportsList } from '@/components/finance/FinancialReportsList';

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

      <section className="flex flex-col gap-3">
        <h2>Ledger</h2>
        <CreateLedgerEntryForm clubUnitId={clubUnitId} programYearId={programYearId} />
        <LedgerEntriesList clubUnitId={clubUnitId} entries={ledgerEntries} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Dues</h2>
        <DuesSettingsForm clubUnitId={clubUnitId} settings={duesSettings} />
        <GenerateDuesRecordsForm clubUnitId={clubUnitId} programYearId={programYearId} />
        <DuesRecordsList clubUnitId={clubUnitId} records={duesRecords} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Invoices</h2>
        <CreateInvoiceForm clubUnitId={clubUnitId} programYearId={programYearId} />
        <InvoicesList clubUnitId={clubUnitId} invoices={invoices} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Installment plans</h2>
        <CreateInstallmentPlanForm clubUnitId={clubUnitId} />
        <InstallmentPlansList clubUnitId={clubUnitId} plans={installmentPlans} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Financial reports</h2>
        <GenerateReportForm clubUnitId={clubUnitId} programYearId={programYearId} />
        <FinancialReportsList clubUnitId={clubUnitId} reports={reports} />
      </section>
    </main>
  );
}
