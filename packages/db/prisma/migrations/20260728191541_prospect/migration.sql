-- CreateEnum
CREATE TYPE "prospect_pipeline_status" AS ENUM ('new', 'contacted', 'interested', 'not_interested', 'joined');

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as prior
-- migrations: both are hand-added on the Unsupported("ltree") `path` column,
-- invisible to Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "prospect" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "photo_url" TEXT,
    "bio" TEXT,
    "lead_source" TEXT,
    "preferred_role" TEXT,
    "pipeline_status" "prospect_pipeline_status" NOT NULL DEFAULT 'new',
    "converted_to_person_id" UUID,
    "converted_at" TIMESTAMP(3),
    "delete_after" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospect_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_converted_to_person_id_fkey" FOREIGN KEY ("converted_to_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
