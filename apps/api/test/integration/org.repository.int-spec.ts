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

  // Regression test: reparent's UPDATE originally computed the new path via
  // `subpath(path, nlevel(node.path))` unconditionally. That expression
  // raises Postgres error "invalid positions" for the moved node's OWN row,
  // because `WHERE path <@ node.path` always matches the node itself, and for
  // that row offset (nlevel(node.path)) equals nlevel(path) exactly — a
  // boundary `subpath` rejects. Descendant rows never hit this boundary, so a
  // test that only checked descendants would pass even with the bug present;
  // this test asserts both the self-row and a descendant to actually pin it.
  it('reparent rewrites the moved node and its descendants (self-row subpath boundary)', async () => {
    const region = await repo.findByPath('r1');
    const d41 = await repo.findByPath('r1.d41');
    const c1234 = await repo.findByPath('r1.d41.c1234');
    const d99 = await repo.createChild({
      parentId: region!.id,
      type: 'district',
      code: 'd99',
      name: 'District 99',
      timezone: 'UTC',
    });

    await repo.reparent(d41!.id, d99.id);

    const movedDistrict = await repo.findByPath('r1.d99.d41');
    const movedClub = await repo.findByPath('r1.d99.d41.c1234');

    // Self-row: path, depth and parent_id all rewritten.
    expect(movedDistrict).not.toBeNull();
    expect(movedDistrict!.id).toBe(d41!.id);
    expect(movedDistrict!.depth).toBe(2);
    expect(movedDistrict!.parentId).toBe(d99.id);

    // Descendant: path and depth shift with the subtree; parent_id unchanged
    // (still points at the moved district, not at the new grandparent).
    expect(movedClub).not.toBeNull();
    expect(movedClub!.id).toBe(c1234!.id);
    expect(movedClub!.depth).toBe(3);
    expect(movedClub!.parentId).toBe(d41!.id);

    // Old paths no longer resolve.
    expect(await repo.findByPath('r1.d41')).toBeNull();
    expect(await repo.findByPath('r1.d41.c1234')).toBeNull();
  });
});
