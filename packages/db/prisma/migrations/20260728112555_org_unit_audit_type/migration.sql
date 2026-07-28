-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'org_unit_reparented';

-- NOTE: prisma migrate dev proposes DROP INDEX on org_unit_path_gist/
-- org_unit_path_unique because it cannot see indexes on the Unsupported("ltree")
-- column. Stripped by hand — see the Slice 1 migration-apply correction.
