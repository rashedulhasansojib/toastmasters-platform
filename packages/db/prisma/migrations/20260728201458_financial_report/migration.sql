-- CreateEnum
CREATE TYPE "financial_report_type" AS ENUM ('monthly', 'quarterly', 'annual', 'handover');

-- CreateEnum
CREATE TYPE "financial_report_status" AS ENUM ('draft', 'final');

-- CreateTable
CREATE TABLE "financial_report" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "type" "financial_report_type" NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "opening_balance" DECIMAL(12,2) NOT NULL,
    "closing_balance" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "income" JSONB NOT NULL,
    "expenses" JSONB NOT NULL,
    "dues_summary" JSONB NOT NULL,
    "member_counts" JSONB NOT NULL,
    "narrative" TEXT,
    "status" "financial_report_status" NOT NULL DEFAULT 'draft',
    "generated_by" UUID NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "snapshot_url" TEXT,

    CONSTRAINT "financial_report_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "financial_report" ADD CONSTRAINT "financial_report_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_report" ADD CONSTRAINT "financial_report_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_report" ADD CONSTRAINT "financial_report_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_report" ADD CONSTRAINT "financial_report_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
