-- M11 Slice 1: VPE education-credit approval for a delivered speech.
--
-- Auto-requested on meeting close for each approved SpeechSlot whose
-- speaker resolves; VPE explicitly approves (or denies) each delivery in
-- the education drawer. `speech_slot_id` is unique so re-closing a meeting
-- is idempotent. Denominators (project / level completion) are derived
-- from the approved rows in this table, not stored anywhere else.

-- CreateEnum
CREATE TYPE "speech_approval_status" AS ENUM ('requested', 'approved', 'denied');

-- CreateTable
CREATE TABLE "speech_approval" (
    "id" UUID NOT NULL,
    "speech_slot_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "club_unit_id" UUID NOT NULL,
    "path_code" TEXT NOT NULL,
    "project_code" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "status" "speech_approval_status" NOT NULL DEFAULT 'requested',
    "requested_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "denied_at" TIMESTAMP(3),
    "denied_by" UUID,
    "denial_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speech_approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "speech_approval_speech_slot_id_key" ON "speech_approval"("speech_slot_id");

-- CreateIndex
CREATE INDEX "speech_approval_club_unit_id_status_idx" ON "speech_approval"("club_unit_id", "status");

-- CreateIndex
CREATE INDEX "speech_approval_person_id_status_idx" ON "speech_approval"("person_id", "status");

-- AddForeignKey
ALTER TABLE "speech_approval" ADD CONSTRAINT "speech_approval_speech_slot_id_fkey" FOREIGN KEY ("speech_slot_id") REFERENCES "speech_slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_approval" ADD CONSTRAINT "speech_approval_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_approval" ADD CONSTRAINT "speech_approval_club_unit_id_fkey" FOREIGN KEY ("club_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_approval" ADD CONSTRAINT "speech_approval_path_code_fkey" FOREIGN KEY ("path_code") REFERENCES "pathway_path"("path_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_approval" ADD CONSTRAINT "speech_approval_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speech_approval" ADD CONSTRAINT "speech_approval_denied_by_fkey" FOREIGN KEY ("denied_by") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
