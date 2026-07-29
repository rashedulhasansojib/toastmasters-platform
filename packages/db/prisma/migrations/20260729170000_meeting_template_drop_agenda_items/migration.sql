-- M9: meeting templates no longer carry agenda line items.
--
-- A Toastmasters meeting's running order is fixed and derived from the role
-- assignments and prepared speakers (see the API's `agenda-schedule.ts`), so
-- there is nothing per-meeting to template. The column was only ever written
-- by the template snapshot added earlier in this same milestone.
ALTER TABLE "meeting_template" DROP COLUMN "agenda_items";
