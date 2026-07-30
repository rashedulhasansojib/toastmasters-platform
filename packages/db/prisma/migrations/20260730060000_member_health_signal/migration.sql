-- CreateEnum
CREATE TYPE "member_health_band" AS ENUM ('healthy', 'watch', 'at_risk', 'disengaged');

-- CreateTable
CREATE TABLE "member_health_signal" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "club_membership_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_speech_at" TIMESTAMP(3),
    "days_since_last_speech" INTEGER,
    "band" "member_health_band" NOT NULL,
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "data_source" TEXT NOT NULL DEFAULT 'speech_only_v1',

    CONSTRAINT "member_health_signal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_health_signal_club_membership_id_key" ON "member_health_signal"("club_membership_id");

-- CreateIndex
CREATE INDEX "member_health_signal_org_unit_id_band_idx" ON "member_health_signal"("org_unit_id", "band");

-- AddForeignKey
ALTER TABLE "member_health_signal" ADD CONSTRAINT "member_health_signal_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_health_signal" ADD CONSTRAINT "member_health_signal_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_health_signal" ADD CONSTRAINT "member_health_signal_club_membership_id_fkey" FOREIGN KEY ("club_membership_id") REFERENCES "club_membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_health_signal" ADD CONSTRAINT "member_health_signal_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
