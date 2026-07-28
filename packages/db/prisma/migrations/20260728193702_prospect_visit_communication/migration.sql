-- CreateEnum
CREATE TYPE "prospect_communication_channel" AS ENUM ('call', 'message', 'email', 'in_person', 'other');

-- CreateTable
CREATE TABLE "prospect_visit" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "attended_at" TIMESTAMP(3) NOT NULL,
    "logged_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospect_visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_communication" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "channel" "prospect_communication_channel" NOT NULL,
    "note" TEXT NOT NULL,
    "logged_by" UUID NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospect_communication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prospect_visit_prospect_id_meeting_id_key" ON "prospect_visit"("prospect_id", "meeting_id");

-- AddForeignKey
ALTER TABLE "prospect_visit" ADD CONSTRAINT "prospect_visit_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_visit" ADD CONSTRAINT "prospect_visit_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_visit" ADD CONSTRAINT "prospect_visit_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_communication" ADD CONSTRAINT "prospect_communication_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_communication" ADD CONSTRAINT "prospect_communication_logged_by_fkey" FOREIGN KEY ("logged_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
