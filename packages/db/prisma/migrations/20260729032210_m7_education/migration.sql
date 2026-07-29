-- CreateEnum
CREATE TYPE "evaluation_subject_kind" AS ENUM ('prepared_speech', 'table_topic');

-- CreateEnum
CREATE TYPE "evaluation_mode" AS ENUM ('form', 'audio', 'scan');

-- CreateEnum
CREATE TYPE "evaluation_visibility" AS ENUM ('speaker_and_vpe', 'speaker_only');

-- CreateEnum
CREATE TYPE "mentorship_purpose" AS ENUM ('new_member_onboarding', 'pathway_project', 'contest_prep', 'officer_transition', 'general');

-- CreateEnum
CREATE TYPE "mentorship_status" AS ENUM ('proposed', 'active', 'completed', 'ended');

-- CreateEnum
CREATE TYPE "mentorship_ended_reason" AS ENUM ('completed', 'mentor_unavailable', 'mentee_left', 'mismatch');

-- CreateEnum
CREATE TYPE "onboarding_audience" AS ENUM ('new_member', 'new_officer', 'guest', 'mentor');

-- CreateTable
CREATE TABLE "education_record" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "club_unit_id" UUID NOT NULL,
    "path_code" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "credential" TEXT,
    "levels" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "education_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speech_evaluation" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "subject_kind" "evaluation_subject_kind" NOT NULL,
    "speech_slot_id" UUID,
    "speaker_person_id" UUID,
    "speaker_prospect_id" UUID,
    "evaluator_person_id" UUID NOT NULL,
    "mode" "evaluation_mode" NOT NULL,
    "form_scales" JSONB,
    "form_excelled_at" TEXT,
    "form_work_on" TEXT,
    "form_challenge_yourself" TEXT,
    "audio_url" TEXT,
    "scan_url" TEXT,
    "metrics_snapshot" JSONB NOT NULL,
    "visibility" "evaluation_visibility" NOT NULL DEFAULT 'speaker_and_vpe',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speech_evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentorship_pairing" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "mentor_person_id" UUID NOT NULL,
    "mentee_person_id" UUID NOT NULL,
    "purpose" "mentorship_purpose" NOT NULL,
    "status" "mentorship_status" NOT NULL DEFAULT 'proposed',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "ended_reason" "mentorship_ended_reason",
    "assigned_by" UUID NOT NULL,
    "goals" JSONB NOT NULL DEFAULT '[]',
    "check_ins" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "mentorship_pairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_availability" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "max_concurrent_mentees" INTEGER NOT NULL DEFAULT 2,
    "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferred_purposes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "mentor_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_track" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID,
    "name" TEXT NOT NULL,
    "audience" "onboarding_audience" NOT NULL,
    "for_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "steps" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_progress" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "steps" JSONB NOT NULL,
    "completed_at" TIMESTAMP(3),
    "nudged_at" TIMESTAMP(3),

    CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "education_record_person_id_club_unit_id_path_code_key" ON "education_record"("person_id", "club_unit_id", "path_code");

-- CreateIndex
CREATE UNIQUE INDEX "mentor_availability_person_id_org_unit_id_key" ON "mentor_availability"("person_id", "org_unit_id");

-- AddForeignKey
ALTER TABLE "education_record" ADD CONSTRAINT "education_record_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_record" ADD CONSTRAINT "education_record_club_unit_id_fkey" FOREIGN KEY ("club_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_record" ADD CONSTRAINT "education_record_path_code_fkey" FOREIGN KEY ("path_code") REFERENCES "pathway_path"("path_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_evaluation" ADD CONSTRAINT "speech_evaluation_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_evaluation" ADD CONSTRAINT "speech_evaluation_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_evaluation" ADD CONSTRAINT "speech_evaluation_speech_slot_id_fkey" FOREIGN KEY ("speech_slot_id") REFERENCES "speech_slot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_evaluation" ADD CONSTRAINT "speech_evaluation_speaker_person_id_fkey" FOREIGN KEY ("speaker_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_evaluation" ADD CONSTRAINT "speech_evaluation_speaker_prospect_id_fkey" FOREIGN KEY ("speaker_prospect_id") REFERENCES "prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_evaluation" ADD CONSTRAINT "speech_evaluation_evaluator_person_id_fkey" FOREIGN KEY ("evaluator_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_pairing" ADD CONSTRAINT "mentorship_pairing_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_pairing" ADD CONSTRAINT "mentorship_pairing_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_pairing" ADD CONSTRAINT "mentorship_pairing_mentor_person_id_fkey" FOREIGN KEY ("mentor_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_pairing" ADD CONSTRAINT "mentorship_pairing_mentee_person_id_fkey" FOREIGN KEY ("mentee_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorship_pairing" ADD CONSTRAINT "mentorship_pairing_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_availability" ADD CONSTRAINT "mentor_availability_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_availability" ADD CONSTRAINT "mentor_availability_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_track" ADD CONSTRAINT "onboarding_track_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "onboarding_track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

