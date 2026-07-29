-- Extend MeetingRoleKey with the two roles the legacy portal used but the
-- initial enum omitted: `president` (who calls the meeting to order) and
-- `table_topics_evaluator` (distinct from `general_evaluator` — evaluates
-- only the impromptu Table Topics round). Both are needed for the meeting
-- detail page's Role Assignments panel.

ALTER TYPE "meeting_role_key" ADD VALUE IF NOT EXISTS 'table_topics_evaluator';
ALTER TYPE "meeting_role_key" ADD VALUE IF NOT EXISTS 'president';
