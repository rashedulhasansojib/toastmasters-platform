-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('invited', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "ClubMemberType" AS ENUM ('new', 'renewing', 'dual', 'reinstated', 'charter', 'transfer', 'honorary');

-- CreateEnum
CREATE TYPE "ClubMembershipTiStanding" AS ENUM ('good', 'lapsed', 'unknown');

-- CreateEnum
CREATE TYPE "ClubMembershipLocalStatus" AS ENUM ('active', 'inactive', 'on_leave', 'suspended');

-- CreateEnum
CREATE TYPE "ClubMembershipProvenance" AS ENUM ('portal', 'ti_import');

-- CreateEnum
CREATE TYPE "RoleAssignmentStatus" AS ENUM ('pending', 'active', 'ended', 'revoked');

-- CreateEnum
CREATE TYPE "RoleAssignmentEndedReason" AS ENUM ('term_end', 'resigned', 'removed', 'succeeded');

-- CreateEnum
CREATE TYPE "ProgramYearStatus" AS ENUM ('upcoming', 'current', 'closed');

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here. Both are hand-added (Slice 1) on the
-- Unsupported("ltree") `path` column, which Prisma cannot see — it read them
-- as drift, not as intentional. Deliberately omitted; do not reintroduce.

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "photo_url" TEXT,
    "bio" TEXT,
    "ti_member_number" TEXT,
    "status" "PersonStatus" NOT NULL DEFAULT 'invited',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "permission_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_membership" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "club_unit_id" UUID NOT NULL,
    "member_type" "ClubMemberType" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "ti_standing" "ClubMembershipTiStanding" NOT NULL DEFAULT 'unknown',
    "local_status" "ClubMembershipLocalStatus" NOT NULL DEFAULT 'active',
    "provenance" "ClubMembershipProvenance" NOT NULL DEFAULT 'portal',
    "last_reconciled_at" TIMESTAMP(3),

    CONSTRAINT "club_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignment" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "term_start" DATE NOT NULL,
    "term_end" DATE NOT NULL,
    "status" "RoleAssignmentStatus" NOT NULL DEFAULT 'pending',
    "appointed_by" UUID NOT NULL,
    "appointed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trained_at" JSONB NOT NULL DEFAULT '[]',
    "ended_reason" "RoleAssignmentEndedReason",

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_year" (
    "id" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "ProgramYearStatus" NOT NULL DEFAULT 'upcoming',

    CONSTRAINT "program_year_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "person_email_key" ON "person"("email");

-- AddForeignKey
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_club_unit_id_fkey" FOREIGN KEY ("club_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_appointed_by_fkey" FOREIGN KEY ("appointed_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active assignment per (unit, role, year) — rbac-design.md §3. M1 applies
-- this to every role; Slice 3 (role_template.is_singleton) may relax it for
-- roles that are legitimately non-singleton.
CREATE UNIQUE INDEX "role_assignment_singleton"
  ON "role_assignment" ("org_unit_id", "role", "program_year_id")
  WHERE "status" = 'active';

-- One primary (home) club membership per person, while current — a past
-- primary that has since left doesn't block a new one.
CREATE UNIQUE INDEX "club_membership_one_primary"
  ON "club_membership" ("person_id")
  WHERE "is_primary" = true AND "left_at" IS NULL;
