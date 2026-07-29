import {
  areaVisitReport,
  presidentContactLog,
  dcpProjection,
  clubHealthSnapshot,
  ticket,
  ticketComment,
  areaDashboardResponse,
  type AreaVisitReport,
  type PresidentContactLog,
  type DcpProjection,
  type ClubHealthSnapshot,
  type Ticket,
  type TicketComment,
  type AreaDashboardResponse,
} from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

export async function listVisitReports(clubUnitId: string): Promise<AreaVisitReport[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/visit-reports`);
  if (!response.ok) return [];
  return areaVisitReport.array().parse(await response.json());
}

export async function listContactLog(clubUnitId: string): Promise<PresidentContactLog[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/contact-log`);
  if (!response.ok) return [];
  return presidentContactLog.array().parse(await response.json());
}

export async function getDcpProjection(
  clubUnitId: string,
  programYearId: string | null,
): Promise<DcpProjection | null> {
  if (!programYearId) return null;
  const response = await authedFetch(
    `/v1/clubs/${clubUnitId}/dcp-projection?programYearId=${encodeURIComponent(programYearId)}`,
  );
  if (!response.ok) return null;
  return dcpProjection.parse(await response.json());
}

export async function listHealthSnapshots(clubUnitId: string): Promise<ClubHealthSnapshot[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/health-snapshots`);
  if (!response.ok) return [];
  return clubHealthSnapshot.array().parse(await response.json());
}

export async function listMyTickets(): Promise<Ticket[]> {
  const response = await authedFetch(`/v1/tickets/mine`);
  if (!response.ok) return [];
  return ticket.array().parse(await response.json());
}

export async function listTicketsByScope(scopeUnitId: string): Promise<Ticket[]> {
  const response = await authedFetch(`/v1/tickets?scope=${encodeURIComponent(scopeUnitId)}`);
  if (!response.ok) return [];
  return ticket.array().parse(await response.json());
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const response = await authedFetch(`/v1/tickets/${id}`);
  if (!response.ok) return null;
  return ticket.parse(await response.json());
}

export async function listTicketComments(id: string): Promise<TicketComment[]> {
  const response = await authedFetch(`/v1/tickets/${id}/comments`);
  if (!response.ok) return [];
  return ticketComment.array().parse(await response.json());
}

export async function getAreaDashboard(
  areaUnitId: string,
  programYearId: string | null,
): Promise<AreaDashboardResponse | null> {
  if (!programYearId) return null;
  const response = await authedFetch(
    `/v1/areas/${areaUnitId}/dashboard?programYearId=${encodeURIComponent(programYearId)}`,
  );
  if (!response.ok) return null;
  return areaDashboardResponse.parse(await response.json());
}
