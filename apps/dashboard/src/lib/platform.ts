import { platformConsoleSummary, type PlatformConsoleSummary } from '@toastmasters/contracts';
import { authedFetch } from './session-proxy';

/**
 * Returns null on 403 as well as on any other failure, so the page can render
 * a "not available" state rather than throwing. The 403 is the real gate —
 * only system_admin holds `platform.console`/`read`.
 */
export async function getPlatformConsole(
  regionUnitId: string,
): Promise<PlatformConsoleSummary | null> {
  const response = await authedFetch(`/v1/platform/${regionUnitId}/console`);
  if (!response.ok) return null;
  return platformConsoleSummary.parse(await response.json());
}
