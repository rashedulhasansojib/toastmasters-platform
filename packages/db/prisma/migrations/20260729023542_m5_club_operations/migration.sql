-- CreateEnum
CREATE TYPE "library_item_kind" AS ENUM ('document', 'media', 'link', 'note');

-- CreateEnum
CREATE TYPE "library_item_category" AS ENUM ('governance', 'training', 'branding', 'meeting', 'finance', 'media', 'external', 'other');

-- CreateEnum
CREATE TYPE "library_item_visibility" AS ENUM ('public', 'members', 'officers', 'role_scoped');

-- CreateEnum
CREATE TYPE "content_plan_channel" AS ENUM ('facebook', 'instagram', 'linkedin', 'website', 'newsletter', 'whatsapp', 'other');

-- CreateEnum
CREATE TYPE "content_plan_status" AS ENUM ('idea', 'drafting', 'ready', 'published', 'cancelled');

-- CreateEnum
CREATE TYPE "inventory_item_category" AS ENUM ('banner', 'trophy', 'timer_device', 'stationery', 'equipment', 'book', 'signage', 'other');

-- CreateEnum
CREATE TYPE "inventory_item_condition" AS ENUM ('new', 'good', 'worn', 'damaged', 'lost');

-- CreateEnum
CREATE TYPE "inventory_movement_type" AS ENUM ('acquire', 'checkout', 'return', 'dispose', 'adjust', 'audit');

-- CreateTable
CREATE TABLE "library_item" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "kind" "library_item_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" "library_item_category" NOT NULL,
    "file_url" TEXT,
    "file_mime_type" TEXT,
    "file_size_bytes" INTEGER,
    "file_checksum" TEXT,
    "external_url" TEXT,
    "body" TEXT,
    "visibility" "library_item_visibility" NOT NULL DEFAULT 'officers',
    "visible_to_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedes_id" UUID,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "program_year_id" TEXT,
    "review_by" DATE,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "library_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_plan_item" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel" "content_plan_channel" NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" "content_plan_status" NOT NULL DEFAULT 'idea',
    "copy" TEXT,
    "asset_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "linked_meeting_id" UUID,
    "assigned_to_person_id" UUID,
    "published_url" TEXT,
    "published_at" TIMESTAMP(3),
    "lead_source_tag" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_plan_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_item" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "inventory_item_category" NOT NULL,
    "unit" TEXT NOT NULL,
    "condition" "inventory_item_condition" NOT NULL DEFAULT 'good',
    "location" TEXT,
    "custodian_person_id" UUID,
    "acquired_on" DATE,
    "acquisition_ledger_entry_id" UUID,
    "replacement_cost" DECIMAL(10,2),
    "last_audited_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "inventory_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movement" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "type" "inventory_movement_type" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "by_person_id" UUID NOT NULL,
    "meeting_id" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "inventory_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_item_supersedes_id_key" ON "library_item"("supersedes_id");

-- CreateIndex
CREATE INDEX "library_browse" ON "library_item"("org_unit_id", "kind", "category");

-- CreateIndex
CREATE INDEX "library_review" ON "library_item"("review_by");

-- CreateIndex
CREATE INDEX "inv_movements" ON "inventory_movement"("item_id", "at" DESC);

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "library_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plan_item" ADD CONSTRAINT "content_plan_item_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plan_item" ADD CONSTRAINT "content_plan_item_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plan_item" ADD CONSTRAINT "content_plan_item_linked_meeting_id_fkey" FOREIGN KEY ("linked_meeting_id") REFERENCES "meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_plan_item" ADD CONSTRAINT "content_plan_item_assigned_to_person_id_fkey" FOREIGN KEY ("assigned_to_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_custodian_person_id_fkey" FOREIGN KEY ("custodian_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_acquisition_ledger_entry_id_fkey" FOREIGN KEY ("acquisition_ledger_entry_id") REFERENCES "ledger_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_by_person_id_fkey" FOREIGN KEY ("by_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- M5: append-only enforcement, same pattern as ledger_entry/audit_event.
REVOKE UPDATE, DELETE ON "inventory_movement" FROM CURRENT_USER;
