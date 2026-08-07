-- Let ON DELETE SET NULL fire on append-only tables without opening them up.
--
-- Four append-only tables (REVOKE UPDATE, DELETE — NFR-4) are referenced by a
-- foreign key declared ON DELETE SET NULL. When the referenced row goes away,
-- Postgres runs the referential action as the owner of the referencing table —
-- and the owner has had UPDATE revoked, so the whole delete fails with
--   ERROR: permission denied for table <t>
-- Confirmed in production shape by DELETE /v1/org-units/:id, which 500s
-- because audit_event.org_unit_id is SET NULL.
--
-- Column-scoped GRANTs rather than a blanket one: only the FK back-reference
-- may be nulled, and only by the referential action. Every column that carries
-- the recorded fact — actor, type, action, amount, payload, metadata,
-- timestamps — stays immutable, so the append-only guarantee is unchanged.
-- A blanket `GRANT UPDATE` here would silently undo NFR-4 for these tables.

GRANT UPDATE ("org_unit_id") ON "audit_event" TO CURRENT_USER;
GRANT UPDATE ("meeting_id") ON "inventory_movement" TO CURRENT_USER;
GRANT UPDATE ("reversal_of_entry_id") ON "ledger_entry" TO CURRENT_USER;
GRANT UPDATE ("target_role_assignment_id") ON "meeting_live_record" TO CURRENT_USER;
