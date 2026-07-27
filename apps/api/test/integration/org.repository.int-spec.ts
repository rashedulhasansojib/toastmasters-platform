import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { PrismaClient } from '@toastmasters/db';
import { startTestDb } from '../support/test-db';
import { OrgUnitRepository } from '../../src/modules/org/org.repository';

describe('OrgUnitRepository (integration)', () => {
  let db: PrismaClient;
  let stop: () => Promise<void>;
  let repo: OrgUnitRepository;

  beforeAll(async () => {
    ({ db, stop } = await startTestDb());
    repo = new OrgUnitRepository(db);
  });
  afterAll(async () => {
    await stop();
  });

  it('builds a region→district→club tree with materialised paths', async () => {
    const region = await repo.createRoot({
      type: 'region',
      code: 'r1',
      name: 'Region 1',
      timezone: 'Asia/Dhaka',
    });
    const district = await repo.createChild({
      parentId: region.id,
      type: 'district',
      code: 'd41',
      name: 'District 41',
      timezone: 'Asia/Dhaka',
    });
    const club = await repo.createChild({
      parentId: district.id,
      type: 'club',
      code: 'c1234',
      name: 'Club 1234',
      timezone: 'Asia/Dhaka',
    });

    expect(region.path).toBe('r1');
    expect(district.path).toBe('r1.d41');
    expect(club.path).toBe('r1.d41.c1234');
    expect(club.depth).toBe(2);
  });

  it('findSubtree returns self and all descendants (prefix match)', async () => {
    const subtree = await repo.findSubtree('r1.d41');
    const paths = subtree.map((n) => n.path).sort();
    expect(paths).toEqual(['r1.d41', 'r1.d41.c1234']);
  });

  it('rejects a second region root at the database', async () => {
    await expect(
      repo.createRoot({ type: 'region', code: 'r2', name: 'Region 2', timezone: 'UTC' }),
    ).rejects.toThrow();
  });
});
