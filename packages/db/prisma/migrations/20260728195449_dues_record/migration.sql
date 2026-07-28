-- CreateEnum
CREATE TYPE "dues_record_status" AS ENUM ('due', 'partial', 'paid', 'waived', 'lapsed');

-- AlterTable
ALTER TABLE "org_unit" ADD COLUMN     "dues_currency" TEXT,
ADD COLUMN     "local_dues_amount" DECIMAL(10,2),
ADD COLUMN     "ti_dues_amount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "dues_record" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "club_membership_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "dues_period" TEXT NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "ti_amount_due" DECIMAL(10,2) NOT NULL,
    "ti_amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ti_currency" TEXT NOT NULL,
    "ti_paid_at" TIMESTAMP(3),
    "ti_submitted_to_whq_at" TIMESTAMP(3),
    "local_amount_due" DECIMAL(10,2) NOT NULL,
    "local_amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "local_currency" TEXT NOT NULL,
    "local_paid_at" TIMESTAMP(3),
    "status" "dues_record_status" NOT NULL DEFAULT 'due',
    "ledger_entry_ids" UUID[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dues_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dues_record_club_membership_id_dues_period_key" ON "dues_record"("club_membership_id", "dues_period");

-- AddForeignKey
ALTER TABLE "dues_record" ADD CONSTRAINT "dues_record_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dues_record" ADD CONSTRAINT "dues_record_club_membership_id_fkey" FOREIGN KEY ("club_membership_id") REFERENCES "club_membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dues_record" ADD CONSTRAINT "dues_record_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dues_record" ADD CONSTRAINT "dues_record_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
