-- CreateEnum
CREATE TYPE "UnitPolicySubjectKind" AS ENUM ('role', 'person');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('break_glass_mint', 'restricted_read');

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as every prior
-- slice: both are hand-added on the Unsupported("ltree") `path` column,
-- invisible to Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "unit_policy_grant" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "subject_kind" "UnitPolicySubjectKind" NOT NULL,
    "subject_role" TEXT,
    "subject_person_id" UUID,
    "resource" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "condition" "PermissionCondition" NOT NULL DEFAULT 'any',
    "effect" "PermissionEffect" NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "unit_policy_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_grant" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "condition" "PermissionCondition" NOT NULL DEFAULT 'any',
    "effect" "PermissionEffect" NOT NULL,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "person_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_person_id" UUID NOT NULL,
    "type" "AuditEventType" NOT NULL,
    "resource" TEXT,
    "action" "PermissionAction",
    "org_unit_id" UUID,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "unit_policy_grant" ADD CONSTRAINT "unit_policy_grant_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_policy_grant" ADD CONSTRAINT "unit_policy_grant_subject_person_id_fkey" FOREIGN KEY ("subject_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_policy_grant" ADD CONSTRAINT "unit_policy_grant_resource_fkey" FOREIGN KEY ("resource") REFERENCES "resource_catalog"("resource") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_policy_grant" ADD CONSTRAINT "unit_policy_grant_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_grant" ADD CONSTRAINT "person_grant_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_grant" ADD CONSTRAINT "person_grant_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_grant" ADD CONSTRAINT "person_grant_resource_fkey" FOREIGN KEY ("resource") REFERENCES "resource_catalog"("resource") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_grant" ADD CONSTRAINT "person_grant_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- audit_event is append-only at the database, not by convention (CLAUDE.md
-- DoD item 4). Correct with new rows; never update or delete a written event.
REVOKE UPDATE, DELETE ON "audit_event" FROM CURRENT_USER;
