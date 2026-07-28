-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'expired', 'revoked');

-- NOTE: prisma migrate dev proposes DROP INDEX on org_unit_path_gist/
-- org_unit_path_unique because it cannot see indexes on the Unsupported("ltree")
-- column. Stripped by hand — see the Slice 1 migration-apply correction.

-- CreateTable
CREATE TABLE "invitation" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "program_year_id" TEXT NOT NULL,
    "invited_by" UUID NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "accepted_person_id" UUID,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_token_hash_key" ON "invitation"("token_hash");

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_program_year_id_fkey" FOREIGN KEY ("program_year_id") REFERENCES "program_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_accepted_person_id_fkey" FOREIGN KEY ("accepted_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
