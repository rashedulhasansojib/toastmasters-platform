-- M9: the speech slot becomes the agenda's "Prepared Speakers" block (the
-- legacy portal's `speakers[]`), so it carries the pairing the printed
-- agenda needs.
--
-- `requested_by` (who filed it) stays distinct from `speaker_person_id`
-- (who delivers it): a VPE building next week's agenda files slots on other
-- members' behalf. NULL speaker means "the requester speaks".
ALTER TABLE "speech_slot"
  ADD COLUMN "position"            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "speaker_person_id"   UUID REFERENCES "person"("id"),
  ADD COLUMN "evaluator_person_id" UUID REFERENCES "person"("id"),
  ADD COLUMN "notes"               TEXT;

-- Backfill the running order for rows created before `position` existed,
-- preserving the order they were requested in.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY meeting_id ORDER BY created_at) AS seq
  FROM "speech_slot"
)
UPDATE "speech_slot" s
SET "position" = ordered.seq
FROM ordered
WHERE s.id = ordered.id;

-- Deliberately an index, not a unique constraint: reordering swaps two
-- positions, which a unique constraint would reject mid-swap without a
-- temporary value.
CREATE INDEX "speech_slot_meeting_id_position_idx"
  ON "speech_slot"("meeting_id", "position");
