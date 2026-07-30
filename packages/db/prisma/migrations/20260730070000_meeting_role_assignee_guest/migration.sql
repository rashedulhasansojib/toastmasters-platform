-- M4 planner UX parity: enable the `guest` assignee kind that the original
-- meeting_role_assignment migration (20260728143614) deferred until Guest
-- existed. Guest exists now (M4), and system-design.md §9.2 always
-- anticipated guests holding planning roles (TMOD, Timer, Speaker) —
-- especially at open-house / demo meetings.

-- AlterEnum
ALTER TYPE "meeting_role_assignee_kind" ADD VALUE 'guest';

-- AlterTable
ALTER TABLE "meeting_role_assignment"
  ADD COLUMN "assignee_guest_id" UUID;

-- AddForeignKey. ON DELETE SET NULL matches the assignee_person_id shape:
-- if a Guest row is later anonymised or the org tree removes the guest,
-- the assignment history stays intact but stops pointing at identity.
ALTER TABLE "meeting_role_assignment"
  ADD CONSTRAINT "meeting_role_assignment_assignee_guest_id_fkey"
  FOREIGN KEY ("assignee_guest_id") REFERENCES "guest"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
