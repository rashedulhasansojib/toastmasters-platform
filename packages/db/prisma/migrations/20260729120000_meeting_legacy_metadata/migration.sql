-- Meeting metadata carried over from the legacy portal. All optional.
ALTER TABLE "meeting"
  ADD COLUMN "title" VARCHAR(200),
  ADD COLUMN "theme" VARCHAR(200),
  ADD COLUMN "venue" VARCHAR(200),
  ADD COLUMN "meeting_number" INTEGER,
  ADD COLUMN "word_of_day" JSONB,
  ADD COLUMN "table_topic_questions" JSONB,
  ADD COLUMN "join_url" VARCHAR(500);
