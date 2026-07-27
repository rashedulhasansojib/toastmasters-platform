import { describe, it, expect } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports liveness that satisfies the shared contract', () => {
    const service = new HealthService();
    const result = service.liveness();
    expect(result.status).toBe('ok');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });
});
