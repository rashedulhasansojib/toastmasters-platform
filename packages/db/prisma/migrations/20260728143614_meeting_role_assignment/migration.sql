-- CreateEnum
CREATE TYPE "meeting_role_key" AS ENUM ('toastmaster', 'general_evaluator', 'table_topics_master', 'timer', 'ah_counter', 'grammarian', 'sergeant_at_arms', 'speaker', 'evaluator');

-- CreateEnum
CREATE TYPE "meeting_role_assignee_kind" AS ENUM ('member', 'cross_club', 'unfilled');

-- CreateEnum
CREATE TYPE "meeting_role_assignment_status" AS ENUM ('proposed', 'confirmed', 'declined', 'fulfilled', 'no_show');

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as prior
-- migrations: both are hand-added on the Unsupported("ltree") `path` column,
-- invisible to Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "meeting_role_assignment" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "role_key" "meeting_role_key" NOT NULL,
    "slot_index" INTEGER,
    "assignee_kind" "meeting_role_assignee_kind" NOT NULL,
    "assignee_person_id" UUID,
    "assignee_home_club_unit_id" UUID,
    "status" "meeting_role_assignment_status" NOT NULL DEFAULT 'proposed',
    "confirmed_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "declined_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_role_assignment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "meeting_role_assignment" ADD CONSTRAINT "meeting_role_assignment_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_role_assignment" ADD CONSTRAINT "meeting_role_assignment_assignee_person_id_fkey" FOREIGN KEY ("assignee_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_role_assignment" ADD CONSTRAINT "meeting_role_assignment_assignee_home_club_unit_id_fkey" FOREIGN KEY ("assignee_home_club_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
