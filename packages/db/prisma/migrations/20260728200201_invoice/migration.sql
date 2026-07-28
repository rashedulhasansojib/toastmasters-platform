-- CreateEnum
CREATE TYPE "invoice_issued_to_kind" AS ENUM ('member', 'prospect', 'external');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'void');

-- CreateTable
CREATE TABLE "invoice_sequence" (
    "org_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invoice_sequence_pkey" PRIMARY KEY ("org_unit_id","program_year_id")
);

-- CreateTable
CREATE TABLE "invoice" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "issued_to_kind" "invoice_issued_to_kind" NOT NULL,
    "issued_to_ref" UUID,
    "issued_to_name" TEXT NOT NULL,
    "issued_to_email" TEXT,
    "issued_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_on" DATE NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'issued',
    "payments" JSONB NOT NULL DEFAULT '[]',
    "pdf_url" TEXT,
    "sent_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "credit_note_for_invoice_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_org_unit_id_program_year_id_invoice_number_key" ON "invoice"("org_unit_id", "program_year_id", "invoice_number");

-- AddForeignKey
ALTER TABLE "invoice_sequence" ADD CONSTRAINT "invoice_sequence_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_sequence" ADD CONSTRAINT "invoice_sequence_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_credit_note_for_invoice_id_fkey" FOREIGN KEY ("credit_note_for_invoice_id") REFERENCES "invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
