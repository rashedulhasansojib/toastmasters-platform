-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'role_assignment_created';
ALTER TYPE "AuditEventType" ADD VALUE 'role_assignment_ended';
ALTER TYPE "AuditEventType" ADD VALUE 'person_grant_created';
ALTER TYPE "AuditEventType" ADD VALUE 'unit_policy_grant_created';
ALTER TYPE "AuditEventType" ADD VALUE 'platform_role_granted';
ALTER TYPE "AuditEventType" ADD VALUE 'platform_role_revoked';

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here. Both are hand-added (Slice 1) on the
-- Unsupported("ltree") `path` column, which Prisma cannot see — it read them
-- as drift, not as intentional. Deliberately omitted; do not reintroduce.
