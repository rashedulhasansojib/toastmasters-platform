-- CreateEnum
CREATE TYPE "excom_meeting_status" AS ENUM ('scheduled', 'in_progress', 'minuted', 'approved');

-- CreateEnum
CREATE TYPE "motion_outcome" AS ENUM ('carried', 'failed', 'withdrawn', 'tabled', 'no_second');

-- CreateEnum
CREATE TYPE "minutes_source_kind" AS ENUM ('excom', 'club_meeting');

-- CreateEnum
CREATE TYPE "minutes_visibility" AS ENUM ('officers', 'members', 'public');

-- CreateEnum
CREATE TYPE "support_request_status" AS ENUM ('open', 'filled', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "excom_meeting" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "held_at" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "called_by" UUID NOT NULL,
    "attendees" JSONB NOT NULL DEFAULT '[]',
    "quorum_rule" TEXT NOT NULL,
    "quorum_met" BOOLEAN NOT NULL DEFAULT false,
    "agenda" JSONB NOT NULL DEFAULT '[]',
    "status" "excom_meeting_status" NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excom_meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motion" (
    "id" UUID NOT NULL,
    "excom_meeting_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "moved_by_person_id" UUID NOT NULL,
    "seconded_by_person_id" UUID,
    "discussion" TEXT,
    "vote" JSONB,
    "outcome" "motion_outcome" NOT NULL DEFAULT 'no_second',
    "effective_from" DATE,
    "supersedes_motion_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minutes" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "source_kind" "minutes_source_kind" NOT NULL,
    "excom_meeting_id" UUID,
    "club_meeting_id" UUID,
    "drafted_by" UUID NOT NULL,
    "drafted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "body" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by_person_id" UUID,
    "published_at" TIMESTAMP(3),
    "library_item_id" UUID,
    "visibility" "minutes_visibility" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedes_id" UUID,

    CONSTRAINT "minutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_profile" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "is_discoverable" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMP(3),
    "consent_version" TEXT,
    "locations" JSONB NOT NULL DEFAULT '[]',
    "available_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mentor_for" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_travel_km" INTEGER,
    "blackout_dates" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "support_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_request" (
    "id" UUID NOT NULL,
    "requesting_unit_id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "role_key" "meeting_role_key" NOT NULL,
    "needed_by" TIMESTAMP(3) NOT NULL,
    "invitees" JSONB NOT NULL DEFAULT '[]',
    "status" "support_request_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "motion_supersedes_motion_id_key" ON "motion"("supersedes_motion_id");

-- CreateIndex
CREATE UNIQUE INDEX "motion_excom_meeting_id_seq_key" ON "motion"("excom_meeting_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "minutes_supersedes_id_key" ON "minutes"("supersedes_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_profile_person_id_key" ON "support_profile"("person_id");

-- AddForeignKey
ALTER TABLE "excom_meeting" ADD CONSTRAINT "excom_meeting_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excom_meeting" ADD CONSTRAINT "excom_meeting_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excom_meeting" ADD CONSTRAINT "excom_meeting_called_by_fkey" FOREIGN KEY ("called_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motion" ADD CONSTRAINT "motion_excom_meeting_id_fkey" FOREIGN KEY ("excom_meeting_id") REFERENCES "excom_meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motion" ADD CONSTRAINT "motion_moved_by_person_id_fkey" FOREIGN KEY ("moved_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motion" ADD CONSTRAINT "motion_seconded_by_person_id_fkey" FOREIGN KEY ("seconded_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motion" ADD CONSTRAINT "motion_supersedes_motion_id_fkey" FOREIGN KEY ("supersedes_motion_id") REFERENCES "motion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_excom_meeting_id_fkey" FOREIGN KEY ("excom_meeting_id") REFERENCES "excom_meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_club_meeting_id_fkey" FOREIGN KEY ("club_meeting_id") REFERENCES "meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_drafted_by_fkey" FOREIGN KEY ("drafted_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_approved_by_person_id_fkey" FOREIGN KEY ("approved_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "library_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minutes" ADD CONSTRAINT "minutes_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "minutes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_profile" ADD CONSTRAINT "support_profile_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_requesting_unit_id_fkey" FOREIGN KEY ("requesting_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

