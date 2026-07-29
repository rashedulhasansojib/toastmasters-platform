-- Append-only hardening for votes and attendance/live-record.
-- CLAUDE.md §1 / §6 name votes and attendance as DB-enforced append-only
-- (NFR-4). The application layer already writes correcting rows rather
-- than mutating; this migration makes the invariant enforced at the DB
-- rather than by convention, matching the earlier REVOKEs on
-- ledger_entry, audit_event, inventory_movement, ticket_comment.
REVOKE UPDATE, DELETE ON "vote" FROM CURRENT_USER;
REVOKE UPDATE, DELETE ON "meeting_live_record" FROM CURRENT_USER;
