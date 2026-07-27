import { describe, it, expect } from 'vitest';
import { withTestDb } from '../support/test-db';

describe('integration harness', () => {
  it('runs migrations and supports ltree prefix queries', async () => {
    await withTestDb(async (db) => {
      // ltree is enabled and the operator works on a real container.
      const rows = await db.$queryRaw<Array<{ covered: boolean }>>`
        SELECT ('a.b.c'::ltree <@ 'a.b'::ltree) AS covered
      `;
      expect(rows[0]?.covered).toBe(true);

      // The committed init migration ran (ltree extension present).
      const ext = await db.$queryRaw<Array<{ extname: string }>>`
        SELECT extname FROM pg_extension WHERE extname = 'ltree'
      `;
      expect(ext).toHaveLength(1);
    });
  });
});
