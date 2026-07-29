import { inventoryItem, type InventoryItem } from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

export async function listInventory(clubUnitId: string): Promise<InventoryItem[]> {
  const response = await authedFetch(`/v1/clubs/${clubUnitId}/inventory`);
  if (!response.ok) return [];
  return inventoryItem.array().parse(await response.json());
}
