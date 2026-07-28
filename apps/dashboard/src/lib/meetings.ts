import { agendaItem, type AgendaItem } from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

export async function getAgendaItems(clubUnitId: string, meetingId: string): Promise<AgendaItem[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/meetings/${meetingId}/agenda-items`);
  if (!response.ok) return [];
  return agendaItem.array().parse(await response.json());
}
