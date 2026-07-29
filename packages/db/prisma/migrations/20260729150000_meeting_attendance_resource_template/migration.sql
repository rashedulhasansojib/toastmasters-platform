-- M9 Slices 3–5: the remaining legacy meeting-page surfaces —
-- member attendance, per-meeting resources, and full meeting templates.

-- ---------------------------------------------------------------------------
-- Attendance: append-only member headcount.
-- CLAUDE.md §1 / NFR-4 name attendance as DB-enforced append-only. Flipping a
-- member present -> absent inserts a correcting row; the roster is the latest
-- row per person. REVOKE (below) makes that an invariant, not a convention.
-- ---------------------------------------------------------------------------
CREATE TABLE "meeting_attendance_record" (
  "id"          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id"  UUID         NOT NULL REFERENCES "meeting"("id"),
  "person_id"   UUID         NOT NULL REFERENCES "person"("id"),
  "present"     BOOLEAN      NOT NULL,
  "recorded_by" UUID         NOT NULL REFERENCES "person"("id"),
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Ordered to serve the latest-row-per-person read directly.
CREATE INDEX "meeting_attendance_record_meeting_id_person_id_recorded_at_idx"
  ON "meeting_attendance_record"("meeting_id", "person_id", "recorded_at");

REVOKE UPDATE, DELETE ON "meeting_attendance_record" FROM CURRENT_USER;

-- ---------------------------------------------------------------------------
-- Resources: free-form per-meeting notes. Editable in place — there is no
-- file behind these and they are not the club's library (M5), so no REVOKE.
-- ---------------------------------------------------------------------------
CREATE TABLE "meeting_resource" (
  "id"          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id"  UUID         NOT NULL REFERENCES "meeting"("id"),
  "position"    INTEGER      NOT NULL,
  "title"       VARCHAR(200) NOT NULL,
  "description" TEXT,
  "created_by"  UUID         NOT NULL REFERENCES "person"("id"),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "meeting_resource_meeting_id_position_key"
  ON "meeting_resource"("meeting_id", "position");

-- ---------------------------------------------------------------------------
-- Meeting templates: the legacy portal's `isTemplate` event, given its own
-- table so a template never carries a meaningless scheduled_at/program_year_id
-- /status and can never appear in a meeting list or a DCP count.
-- ---------------------------------------------------------------------------
CREATE TABLE "meeting_template" (
  "id"                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "club_unit_id"          UUID         NOT NULL REFERENCES "org_unit"("id"),
  "name"                  VARCHAR(100) NOT NULL,
  "theme"                 VARCHAR(200),
  "venue"                 VARCHAR(200),
  "start_time"            VARCHAR(5),
  "join_url"              VARCHAR(500),
  "roles"                 JSONB        NOT NULL,
  "word_of_day"           JSONB,
  "table_topic_questions" JSONB,
  "agenda_items"          JSONB        NOT NULL,
  "is_active"             BOOLEAN      NOT NULL DEFAULT TRUE,
  "created_by"            UUID         NOT NULL REFERENCES "person"("id"),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "meeting_template_club_unit_id_idx"
  ON "meeting_template"("club_unit_id");
