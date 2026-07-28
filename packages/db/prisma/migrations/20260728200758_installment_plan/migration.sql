-- CreateEnum
CREATE TYPE "installment_plan_status" AS ENUM ('active', 'completed', 'defaulted', 'cancelled');

-- CreateTable
CREATE TABLE "installment_plan" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "dues_record_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "schedule" JSONB NOT NULL,
    "status" "installment_plan_status" NOT NULL DEFAULT 'active',
    "approved_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "installment_plan_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "installment_plan" ADD CONSTRAINT "installment_plan_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plan" ADD CONSTRAINT "installment_plan_dues_record_id_fkey" FOREIGN KEY ("dues_record_id") REFERENCES "dues_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plan" ADD CONSTRAINT "installment_plan_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plan" ADD CONSTRAINT "installment_plan_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
