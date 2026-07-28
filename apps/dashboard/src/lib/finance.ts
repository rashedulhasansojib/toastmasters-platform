import {
  ledgerEntry,
  clubDuesSettings,
  duesRecord,
  invoice,
  installmentPlan,
  financialReport,
  type LedgerEntry,
  type ClubDuesSettings,
  type DuesRecord,
  type Invoice,
  type InstallmentPlan,
  type FinancialReport,
} from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

export async function listLedgerEntries(clubUnitId: string): Promise<LedgerEntry[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/ledger-entries`);
  if (!response.ok) return [];
  return ledgerEntry.array().parse(await response.json());
}

export async function getClubDuesSettings(clubUnitId: string): Promise<ClubDuesSettings | null> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/dues-settings`);
  if (!response.ok) return null;
  return clubDuesSettings.parse(await response.json());
}

export async function listDuesRecords(
  clubUnitId: string,
  duesPeriod?: string,
): Promise<DuesRecord[]> {
  const qs = duesPeriod ? `?duesPeriod=${encodeURIComponent(duesPeriod)}` : '';
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/dues-records${qs}`);
  if (!response.ok) return [];
  return duesRecord.array().parse(await response.json());
}

export async function listInvoices(clubUnitId: string): Promise<Invoice[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/invoices`);
  if (!response.ok) return [];
  return invoice.array().parse(await response.json());
}

export async function listInstallmentPlans(clubUnitId: string): Promise<InstallmentPlan[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/installment-plans`);
  if (!response.ok) return [];
  return installmentPlan.array().parse(await response.json());
}

export async function listFinancialReports(clubUnitId: string): Promise<FinancialReport[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/financial-reports`);
  if (!response.ok) return [];
  return financialReport.array().parse(await response.json());
}
