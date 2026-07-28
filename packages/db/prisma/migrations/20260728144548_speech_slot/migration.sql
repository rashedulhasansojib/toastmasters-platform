-- CreateEnum
CREATE TYPE "speech_slot_status" AS ENUM ('requested', 'approved', 'declined');

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as prior
-- migrations: both are hand-added on the Unsupported("ltree") `path` column,
-- invisible to Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "pathway_path" (
    "path_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credential" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pathway_path_pkey" PRIMARY KEY ("path_code")
);

-- CreateTable
CREATE TABLE "pathway_project" (
    "id" UUID NOT NULL,
    "path_code" TEXT NOT NULL,
    "project_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "min_minutes" INTEGER NOT NULL,
    "max_minutes" INTEGER NOT NULL,

    CONSTRAINT "pathway_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speech_slot" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "path_code" TEXT NOT NULL,
    "project_code" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "planned_duration_seconds" INTEGER NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" "speech_slot_status" NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speech_slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pathway_project_path_code_project_code_key" ON "pathway_project"("path_code", "project_code");

-- AddForeignKey
ALTER TABLE "pathway_project" ADD CONSTRAINT "pathway_project_path_code_fkey" FOREIGN KEY ("path_code") REFERENCES "pathway_path"("path_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_slot" ADD CONSTRAINT "speech_slot_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_slot" ADD CONSTRAINT "speech_slot_path_code_fkey" FOREIGN KEY ("path_code") REFERENCES "pathway_path"("path_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_slot" ADD CONSTRAINT "speech_slot_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
