-- NOTE: Prisma's diff engine can't see indexes on OrgUnit.path
-- (Unsupported("ltree")) and proposes dropping them on every migration. Never
-- apply that — see the plan doc's "Migration-apply correction" note.

-- CreateTable
CREATE TABLE "meeting" (
    "id" UUID NOT NULL,
    "club_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_club_unit_id_fkey" FOREIGN KEY ("club_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
