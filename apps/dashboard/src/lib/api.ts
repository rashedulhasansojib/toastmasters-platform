import { healthResponseSchema, type HealthResponse } from '@toastmasters/contracts';

// The dashboard talks to the API and validates responses against the shared
// contracts. It never imports the database layer (enforced by ESLint + by not
// depending on @toastmasters/db).
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return healthResponseSchema.parse(await response.json());
}
