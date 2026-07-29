-- CreateEnum
CREATE TYPE "area_visit_round" AS ENUM ('R1', 'R2');

-- CreateEnum
CREATE TYPE "area_visit_mode" AS ENUM ('in_person', 'online');

-- CreateEnum
CREATE TYPE "area_visit_report_status" AS ENUM ('draft', 'submitted');

-- CreateEnum
CREATE TYPE "president_contact_method" AS ENUM ('call', 'message', 'meeting', 'email');

-- CreateEnum
CREATE TYPE "club_success_plan_status" AS ENUM ('draft', 'submitted', 'revised');

-- CreateEnum
CREATE TYPE "dcp_projected_level" AS ENUM ('none', 'distinguished', 'select_distinguished', 'presidents_distinguished', 'smedley_distinguished');

-- CreateEnum
CREATE TYPE "ticket_severity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('open', 'active', 'resolved');

-- CreateTable
CREATE TABLE "area_visit_report" (
    "id" UUID NOT NULL,
    "area_unit_id" UUID NOT NULL,
    "club_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "round" "area_visit_round" NOT NULL,
    "visited_at" DATE NOT NULL,
    "visit_mode" "area_visit_mode" NOT NULL,
    "by_person_id" UUID NOT NULL,
    "moments_of_truth" JSONB NOT NULL,
    "club_goals_discussed" TEXT,
    "support_requested_from_district" TEXT,
    "status" "area_visit_report_status" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMP(3),

    CONSTRAINT "area_visit_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "president_contact_log" (
    "id" UUID NOT NULL,
    "area_unit_id" UUID NOT NULL,
    "club_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "contacted_at" TIMESTAMP(3) NOT NULL,
    "by_person_id" UUID NOT NULL,
    "method" "president_contact_method" NOT NULL,
    "dcp_discussed" BOOLEAN NOT NULL,
    "note" TEXT,

    CONSTRAINT "president_contact_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_success_plan" (
    "id" UUID NOT NULL,
    "club_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "goal_targets" JSONB NOT NULL,
    "membership_target" INTEGER NOT NULL,
    "strengths" TEXT,
    "challenges" TEXT,
    "contributors" JSONB NOT NULL DEFAULT '[]',
    "status" "club_success_plan_status" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMP(3),
    "submitted_by" UUID,
    "ti_submission_confirmed_at" TIMESTAMP(3),
    "reviews" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "club_success_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dcp_projection" (
    "id" UUID NOT NULL,
    "club_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "goals" JSONB NOT NULL,
    "membership_qualifier_met" BOOLEAN NOT NULL,
    "club_success_plan_qualifier_met" BOOLEAN NOT NULL,
    "projected_level" "dcp_projected_level" NOT NULL DEFAULT 'none',
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dcp_projection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_health_snapshot" (
    "id" UUID NOT NULL,
    "club_unit_id" UUID NOT NULL,
    "year_month" TEXT NOT NULL,
    "meetings_held" INTEGER NOT NULL,
    "attendance_avg" DECIMAL(5,2),
    "member_count" INTEGER NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "roles_filled_pct" DECIMAL(5,2) NOT NULL,
    "speeches_given" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_health_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket" (
    "id" UUID NOT NULL,
    "scope_unit_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "ticket_severity" NOT NULL DEFAULT 'medium',
    "status" "ticket_status" NOT NULL DEFAULT 'open',
    "created_by_person_id" UUID NOT NULL,
    "parties" JSONB NOT NULL DEFAULT '[]',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "reopened_from_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comment" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "by_person_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "area_visit_report_club_unit_id_program_year_id_round_key" ON "area_visit_report"("club_unit_id", "program_year_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "club_success_plan_club_unit_id_program_year_id_key" ON "club_success_plan"("club_unit_id", "program_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "dcp_projection_club_unit_id_program_year_id_key" ON "dcp_projection"("club_unit_id", "program_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "club_health_snapshot_club_unit_id_year_month_key" ON "club_health_snapshot"("club_unit_id", "year_month");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_reopened_from_id_key" ON "ticket"("reopened_from_id");

-- CreateIndex
CREATE INDEX "ticket_scope" ON "ticket"("scope_unit_id");

-- AddForeignKey
ALTER TABLE "area_visit_report" ADD CONSTRAINT "area_visit_report_area_unit_id_fkey" FOREIGN KEY ("area_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_visit_report" ADD CONSTRAINT "area_visit_report_club_unit_id_fkey" FOREIGN KEY ("club_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_visit_report" ADD CONSTRAINT "area_visit_report_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_visit_report" ADD CONSTRAINT "area_visit_report_by_person_id_fkey" FOREIGN KEY ("by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "president_contact_log" ADD CONSTRAINT "president_contact_log_area_unit_id_fkey" FOREIGN KEY ("area_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "president_contact_log" ADD CONSTRAINT "president_contact_log_club_unit_id_fkey" FOREIGN KEY ("club_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "president_contact_log" ADD CONSTRAINT "president_contact_log_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "president_contact_log" ADD CONSTRAINT "president_contact_log_by_person_id_fkey" FOREIGN KEY ("by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_success_plan" ADD CONSTRAINT "club_success_plan_club_unit_id_fkey" FOREIGN KEY ("club_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_success_plan" ADD CONSTRAINT "club_success_plan_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_success_plan" ADD CONSTRAINT "club_success_plan_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dcp_projection" ADD CONSTRAINT "dcp_projection_club_unit_id_fkey" FOREIGN KEY ("club_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dcp_projection" ADD CONSTRAINT "dcp_projection_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_health_snapshot" ADD CONSTRAINT "club_health_snapshot_club_unit_id_fkey" FOREIGN KEY ("club_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_scope_unit_id_fkey" FOREIGN KEY ("scope_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_reopened_from_id_fkey" FOREIGN KEY ("reopened_from_id") REFERENCES "ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comment" ADD CONSTRAINT "ticket_comment_by_person_id_fkey" FOREIGN KEY ("by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- M6: append-only enforcement, same pattern as ledger_entry/inventory_movement.
REVOKE UPDATE, DELETE ON "ticket_comment" FROM CURRENT_USER;
