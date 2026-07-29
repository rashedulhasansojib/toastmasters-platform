-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'org_unit_created';
ALTER TYPE "AuditEventType" ADD VALUE 'org_unit_updated';
ALTER TYPE "AuditEventType" ADD VALUE 'org_unit_deleted';

-- NOTE: written by hand rather than generated. `prisma migrate dev` also
-- wanted to drop the value 'prospect' from "invoice_issued_to_kind" and
-- "ledger_counterparty_kind" — leftover drift from
-- 20260730010000_rename_prospect_to_guest, which added 'guest' but could not
-- remove 'prospect' (Postgres has no DROP VALUE; it needs a type rebuild).
-- That drift predates this migration and is not ours to resolve here.
-- Deliberately omitted; do not reintroduce without checking for rows still
-- using 'prospect'.
