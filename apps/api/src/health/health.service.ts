import { Injectable } from '@nestjs/common';
import { healthResponseSchema, type HealthResponse } from '@toastmasters/contracts';

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  /**
   * Liveness only: the process is up and serving. A readiness probe (database
   * and Redis reachability) is added in M1, once there is a schema to check
   * against — see the build order in CLAUDE.md.
   */
  liveness(): HealthResponse {
    const payload = {
      status: 'ok' as const,
      uptime: (Date.now() - this.startedAt) / 1000,
      timestamp: new Date().toISOString(),
    };
    // Validate against the shared contract so the response and the schema
    // the dashboard parses can never silently drift apart.
    return healthResponseSchema.parse(payload);
  }
}
