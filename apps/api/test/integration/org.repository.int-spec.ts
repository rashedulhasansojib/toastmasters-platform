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
    // Pin the actual invariant (the unique partial index / Postgres
    // unique-violation code), not just "some error was thrown" — that
    // weaker assertion would still pass if creation broke for an
    // unrelated reason.
    await expect(
      repo.createRoot({ type: 'region', code: 'r2', name: 'Region 2', timezone: 'UTC' }),
    ).rejects.toThrow(/org_unit_single_region_root|23505/);
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

  // Regression test: reparent(nodeId, newParentId) originally had no cycle
  // guard. Reparenting a node under itself or under its own descendant sets
  // parent_id to a value that is itself (transitively) parented by the node
  // being moved — a parent_id cycle — and the path-rewrite UPDATE then nests
  // the node's own path inside its new (already-descended-from-it) path,
  // silently corrupting the tree instead of erroring.
  it('reparent rejects moving a node under its own descendant', async () => {
    const region = await repo.findByPath('r1');
    const d70 = await repo.createChild({
      parentId: region!.id,
      type: 'district',
      code: 'd70',
      name: 'District 70',
      timezone: 'UTC',
    });
    const c700 = await repo.createChild({
      parentId: d70.id,
      type: 'club',
      code: 'c700',
      name: 'Club 700',
      timezone: 'UTC',
    });

    // Moving d70 under its own child c700 would create a parent_id cycle
    // (d70 -> c700 -> d70) and a doubly-nested, corrupted path.
    await expect(repo.reparent(d70.id, c700.id)).rejects.toThrow(
      /Cannot reparent a node under itself or its own descendant/,
    );

    // Tree is unchanged: d70 and c700 keep their original path/parent_id.
    const d70After = await repo.findByPath('r1.d70');
    const c700After = await repo.findByPath('r1.d70.c700');
    expect(d70After).not.toBeNull();
    expect(d70After!.id).toBe(d70.id);
    expect(d70After!.parentId).toBe(region!.id);
    expect(c700After).not.toBeNull();
    expect(c700After!.id).toBe(c700.id);
    expect(c700After!.parentId).toBe(d70.id);

    // Also reject moving a node under itself.
    await expect(repo.reparent(d70.id, d70.id)).rejects.toThrow(
      /Cannot reparent a node under itself or its own descendant/,
    );
  });
});
