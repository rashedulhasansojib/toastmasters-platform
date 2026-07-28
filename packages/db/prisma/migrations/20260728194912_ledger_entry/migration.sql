-- CreateEnum
CREATE TYPE "ledger_direction" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "ledger_counterparty_kind" AS ENUM ('member', 'prospect', 'vendor', 'district', 'other');

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "direction" "ledger_direction" NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "counterparty_kind" "ledger_counterparty_kind" NOT NULL,
    "counterparty_ref" UUID,
    "counterparty_label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "receipt_url" TEXT,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversal_of_entry_id" UUID,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entry_reversal_of_entry_id_key" ON "ledger_entry"("reversal_of_entry_id");

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_reversal_of_entry_id_fkey" FOREIGN KEY ("reversal_of_entry_id") REFERENCES "ledger_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ledger_entry is append-only at the database, not by convention (CLAUDE.md
-- DoD item 4 / system-design.md §12.1). Correct with a reversing entry
-- (reversal_of_entry_id); never update or delete a written entry.
REVOKE UPDATE, DELETE ON "ledger_entry" FROM CURRENT_USER;
