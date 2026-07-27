-- CreateEnum
CREATE TYPE "OrgUnitType" AS ENUM ('international', 'region', 'district', 'division', 'area', 'club');

-- CreateEnum
CREATE TYPE "OrgUnitStatus" AS ENUM ('active', 'low', 'ineligible', 'suspended', 'dissolved');

-- CreateTable
CREATE TABLE "org_unit" (
    "id" UUID NOT NULL,
    "type" "OrgUnitType" NOT NULL,
    "parent_id" UUID,
    "path" ltree NOT NULL,
    "depth" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "OrgUnitStatus" NOT NULL DEFAULT 'active',
    "timezone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_unit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ltree GiST index for prefix (<@) scope queries. Prisma cannot express this on
-- an Unsupported column, so it is added here (migration not yet committed).
CREATE INDEX "org_unit_path_gist" ON "org_unit" USING GIST ("path");

-- Exactly one region root for this deployment (the tree top). A single-DB,
-- row-level, multi-district deployment would relax this to allow sibling roots.
CREATE UNIQUE INDEX "org_unit_single_region_root"
  ON "org_unit" ("type") WHERE "type" = 'region';

-- Path is unique across the tree.
CREATE UNIQUE INDEX "org_unit_path_unique" ON "org_unit" ("path");
