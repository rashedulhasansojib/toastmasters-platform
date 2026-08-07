-- Make the singleton rule apply only to singleton roles.
--
-- M1 created `role_assignment_singleton` as a blanket unique index over every
-- (org_unit, role, program_year) with status = 'active', with a comment saying
-- Slice 3 "may relax it for roles that are legitimately non-singleton" once
-- role_template.is_singleton existed. is_singleton shipped; the relaxation did
-- not. The result: `club_member` — seeded is_singleton = false — was capped at
-- ONE active holder per club per program year, so a second member could not be
-- added and a person could not accumulate roles. Prisma never saw the index
-- (it is absent from schema.prisma), and the resulting P2002 surfaced as an
-- opaque 500.
--
-- Replaced by two narrower rules:
--   1. singleton roles keep one active holder per unit per year;
--   2. nobody holds the SAME role twice in the same unit and year, whatever
--      the role — the invariant the blanket index was accidentally providing
--      and which we must not lose.

ALTER TABLE "role_assignment"
  ADD COLUMN "is_singleton" BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the seeded role templates. Assignments whose role has no
-- template row (M1-era free-text roles) stay false — the blanket index has
-- been enforcing uniqueness for them until now, so any existing rows are
-- already unique and the new no-duplicate index below still covers them.
UPDATE "role_assignment" ra
   SET "is_singleton" = rt."is_singleton"
  FROM "role_template" rt
 WHERE rt."role" = ra."role";

DROP INDEX "role_assignment_singleton";

CREATE UNIQUE INDEX "role_assignment_singleton"
  ON "role_assignment" ("org_unit_id", "role", "program_year_id")
  WHERE "status" = 'active' AND "is_singleton";

CREATE UNIQUE INDEX "role_assignment_no_duplicate"
  ON "role_assignment" ("org_unit_id", "role", "person_id", "program_year_id")
  WHERE "status" = 'active';
