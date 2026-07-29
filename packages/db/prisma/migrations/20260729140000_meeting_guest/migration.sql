-- M9 Slice 2: per-meeting guest roster. Rows are either linked to a
-- Prospect from the pool or a manual (free-text) entry. Editable in place
-- (unlike ledger/audit/attendance/vote/inventory) — the DB layer does not
-- REVOKE UPDATE/DELETE here.
CREATE TABLE "meeting_guest" (
  "id"          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id"  UUID          NOT NULL REFERENCES "meeting"("id"),
  "full_name"   VARCHAR(200)  NOT NULL,
  "email"       VARCHAR(200),
  "phone"       VARCHAR(50),
  "notes"       TEXT,
  "prospect_id" UUID          REFERENCES "prospect"("id"),
  "present"     BOOLEAN       NOT NULL DEFAULT TRUE,
  "added_by"    UUID          NOT NULL REFERENCES "person"("id"),
  "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "meeting_guest_meeting_id_idx" ON "meeting_guest"("meeting_id");

-- One Prospect-from-pool link per meeting. Postgres treats NULL values as
-- distinct inside a UNIQUE constraint, so several manual guests (all with
-- NULL prospect_id) may coexist — the constraint only fires on repeat
-- pool linkage.
CREATE UNIQUE INDEX "meeting_guest_meeting_id_prospect_id_key"
  ON "meeting_guest"("meeting_id", "prospect_id");
