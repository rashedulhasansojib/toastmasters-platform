-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here. Both are hand-added (Slice 1) on the
-- Unsupported("ltree") `path` column, which Prisma cannot see — it read them
-- as drift, not as intentional. Deliberately omitted; do not reintroduce.

-- CreateTable
CREATE TABLE "agenda_item" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "planned_duration_seconds" INTEGER NOT NULL,
    "role_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agenda_item_meeting_id_position_key" ON "agenda_item"("meeting_id", "position");

-- AddForeignKey
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
