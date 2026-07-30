-- Users admin: soft-delete (super-admin People page). Marks a person as
-- gone from the admin surface (search/detail filter deleted_at IS NULL) while
-- keeping the row for referential integrity on ledger/audit/history rows.

ALTER TABLE "person" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Two new AuditEventType values — kept in the same migration as the schema
-- change per CLAUDE.md §4 ("migration committed alongside any schema change").

ALTER TYPE "AuditEventType" ADD VALUE 'person_password_reset';
ALTER TYPE "AuditEventType" ADD VALUE 'person_soft_deleted';
