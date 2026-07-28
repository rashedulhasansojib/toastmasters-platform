-- CreateEnum
CREATE TYPE "meeting_status" AS ENUM ('draft', 'published', 'in_progress', 'closed', 'cancelled');

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as prior
-- migrations: both are hand-added on the Unsupported("ltree") `path` column,
-- invisible to Prisma's diff engine. Deliberately omitted.

-- AlterTable
ALTER TABLE "meeting" ADD COLUMN     "status" "meeting_status" NOT NULL DEFAULT 'draft';
