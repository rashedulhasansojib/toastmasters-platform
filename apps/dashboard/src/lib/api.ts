import { healthResponseSchema, type HealthResponse } from '@toastmasters/contracts';

// The dashboard talks to the API and validates responses against the shared
// contracts. It never imports the database layer (enforced by ESLint + by not
// depending on @toastmasters/db).
//
// Server-side only, hence no NEXT_PUBLIC_ prefix: the browser never calls the
// API directly — it calls this app's own /api/* route handlers, which proxy.
// The prefix would also be actively wrong, since Next.js inlines NEXT_PUBLIC_*
// at build time and production points this at a per-color internal host.
const API_BASE = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return healthResponseSchema.parse(await response.json());
}
