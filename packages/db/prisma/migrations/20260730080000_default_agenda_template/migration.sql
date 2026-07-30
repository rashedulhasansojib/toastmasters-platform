-- Backfill: every existing club that has no active `agenda_template` gets a
-- standard "Default Toastmasters Agenda" — same running order as the derived
-- agenda `apps/api/src/modules/meeting/agenda-schedule.ts` produces, but
-- persisted as agenda_item rows so the planner's Play action has something
-- to apply. The typical Toastmasters meeting flow is standardised enough
-- to bootstrap; clubs can still edit or replace this after the fact.
--
-- Idempotent: `WHERE NOT EXISTS` skips clubs that already have any active
-- template, so re-running this on an environment where a collaborator has
-- since added templates leaves them alone.

INSERT INTO "agenda_template" ("id", "org_unit_id", "name", "items", "is_active", "created_at")
SELECT
  gen_random_uuid(),
  o."id",
  'Default Toastmasters Agenda',
  '[
    {"order": 0,  "title": "Sergeant at Arms opens the floor",           "plannedDurationSeconds": 600,  "roleKey": "sergeant_at_arms"},
    {"order": 1,  "title": "Presiding Officer calls meeting to order",   "plannedDurationSeconds": 600,  "roleKey": "president"},
    {"order": 2,  "title": "Introduction of the Toastmaster of the Day", "plannedDurationSeconds": 60,   "roleKey": "toastmaster"},
    {"order": 3,  "title": "Theme of the Day",                           "plannedDurationSeconds": 120,  "roleKey": "toastmaster"},
    {"order": 4,  "title": "Introduction of the General Evaluator",      "plannedDurationSeconds": 600,  "roleKey": "toastmaster"},
    {"order": 5,  "title": "Evaluator Objectives",                       "plannedDurationSeconds": 120,  "roleKey": "general_evaluator"},
    {"order": 6,  "title": "Prepared Speech Session",                    "plannedDurationSeconds": 1260, "roleKey": "toastmaster"},
    {"order": 7,  "title": "Introduction of the Table Topics Master",    "plannedDurationSeconds": 120,  "roleKey": "toastmaster"},
    {"order": 8,  "title": "Table Topics Session",                       "plannedDurationSeconds": 900,  "roleKey": "table_topics_master"},
    {"order": 9,  "title": "Prepared Speech Evaluations",                "plannedDurationSeconds": 600,  "roleKey": "general_evaluator"},
    {"order": 10, "title": "Table Topic Evaluations",                    "plannedDurationSeconds": 600,  "roleKey": "table_topics_evaluator"},
    {"order": 11, "title": "Ah Counter Report",                          "plannedDurationSeconds": 120,  "roleKey": "ah_counter"},
    {"order": 12, "title": "Timer Report",                               "plannedDurationSeconds": 120,  "roleKey": "timer"},
    {"order": 13, "title": "Grammarian Report",                          "plannedDurationSeconds": 120,  "roleKey": "grammarian"},
    {"order": 14, "title": "Feedback and Q&A",                           "plannedDurationSeconds": 240,  "roleKey": "general_evaluator"},
    {"order": 15, "title": "Presiding Officer closes the meeting",       "plannedDurationSeconds": 120,  "roleKey": "president"}
  ]'::jsonb,
  TRUE,
  CURRENT_TIMESTAMP
FROM "org_unit" o
WHERE o."type" = 'club'
  AND NOT EXISTS (
    SELECT 1
    FROM "agenda_template" t
    WHERE t."org_unit_id" = o."id" AND t."is_active" = TRUE
  );
