-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as Slices 2 and 3:
-- both are hand-added on the Unsupported("ltree") `path` column, invisible to
-- Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "platform_role_assignment" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "org_unit_id" UUID,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "platform_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_role_assignment_person_id_role_org_unit_id_key" ON "platform_role_assignment"("person_id", "role", "org_unit_id");

-- AddForeignKey
ALTER TABLE "platform_role_assignment" ADD CONSTRAINT "platform_role_assignment_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_role_assignment" ADD CONSTRAINT "platform_role_assignment_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_role_assignment" ADD CONSTRAINT "platform_role_assignment_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
