import { describe, it, expect, beforeAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '../../src/config/config.module';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import { OrgModule } from '../../src/modules/org/org.module';

describe('IdentityModule / OrgModule (real Nest DI boot)', () => {
  beforeAll(() => {
    process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5433/test?schema=public';
    process.env.DIRECT_URL ??= process.env.DATABASE_URL;
    process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
    process.env.SESSION_JWT_SECRET ??= 'a'.repeat(32);
  });

  it('boots both modules through real Nest DI without a dependency-resolution error', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, IdentityModule, OrgModule],
    }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
