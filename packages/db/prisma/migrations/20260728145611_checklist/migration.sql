-- CreateEnum
CREATE TYPE "checklist_applies_to" AS ENUM ('meeting', 'excom', 'contest', 'special_event');

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as prior
-- migrations: both are hand-added on the Unsupported("ltree") `path` column,
-- invisible to Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "checklist_template" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "applies_to" "checklist_applies_to" NOT NULL,
    "items" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_run" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "meeting_id" UUID,
    "items" JSONB NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "checklist_run_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "checklist_template" ADD CONSTRAINT "checklist_template_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_run" ADD CONSTRAINT "checklist_run_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_run" ADD CONSTRAINT "checklist_run_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_run" ADD CONSTRAINT "checklist_run_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
