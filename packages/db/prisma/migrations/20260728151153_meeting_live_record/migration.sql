-- CreateEnum
CREATE TYPE "meeting_live_tool_kind" AS ENUM ('timer', 'ah_counter', 'grammarian');

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as prior
-- migrations: both are hand-added on the Unsupported("ltree") `path` column,
-- invisible to Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "meeting_live_record" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "kind" "meeting_live_tool_kind" NOT NULL,
    "client_key" TEXT NOT NULL,
    "target_role_assignment_id" UUID,
    "target_label" TEXT,
    "payload" JSONB NOT NULL,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_live_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_live_record_meeting_id_client_key_key" ON "meeting_live_record"("meeting_id", "client_key");

-- AddForeignKey
ALTER TABLE "meeting_live_record" ADD CONSTRAINT "meeting_live_record_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_live_record" ADD CONSTRAINT "meeting_live_record_target_role_assignment_id_fkey" FOREIGN KEY ("target_role_assignment_id") REFERENCES "meeting_role_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_live_record" ADD CONSTRAINT "meeting_live_record_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
