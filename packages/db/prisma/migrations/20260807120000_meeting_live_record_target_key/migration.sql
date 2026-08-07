-- Split `client_key` into two keys on meeting_live_record.
--
-- `client_key` was carrying both jobs at once: the retry key for a single
-- save attempt AND the identity of the thing being reported on. Because the
-- table is append-only (REVOKE UPDATE, DELETE — NFR-4), the repository's
-- idempotent upsert could only ever insert; a second save of the same
-- grammarian/ah-counter/timer report hit the existing key and was silently
-- discarded. `target_key` now carries identity, `client_key` stays the
-- per-attempt retry key, and a correction is a NEW row read as the newest
-- per (meeting, kind, target_key).

-- The backfill needs UPDATE, which the append-only REVOKE removed. Restore it
-- for the length of this migration and take it away again at the end, so the
-- table leaves this migration exactly as append-only as it entered it.
GRANT UPDATE ON "meeting_live_record" TO CURRENT_USER;

ALTER TABLE "meeting_live_record" ADD COLUMN "target_key" TEXT;

-- Pre-existing rows each stand alone (one row per key, by construction of the
-- old scheme), so the old client_key is a correct identity for them.
UPDATE "meeting_live_record" SET "target_key" = "client_key" WHERE "target_key" IS NULL;

ALTER TABLE "meeting_live_record" ALTER COLUMN "target_key" SET NOT NULL;

REVOKE UPDATE ON "meeting_live_record" FROM CURRENT_USER;

CREATE INDEX "meeting_live_record_meeting_id_kind_target_key_created_at_idx"
  ON "meeting_live_record"("meeting_id", "kind", "target_key", "created_at");
