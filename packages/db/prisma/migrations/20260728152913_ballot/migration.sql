-- CreateEnum
CREATE TYPE "ballot_category" AS ENUM ('best_speaker', 'best_table_topic', 'best_evaluator', 'best_role_player');

-- CreateEnum
CREATE TYPE "ballot_status" AS ENUM ('open', 'tallied');

-- CreateEnum
CREATE TYPE "ballot_eligibility" AS ENUM ('members_present', 'all_present');

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as prior
-- migrations: both are hand-added on the Unsupported("ltree") `path` column,
-- invisible to Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "ballot" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "category" "ballot_category" NOT NULL,
    "status" "ballot_status" NOT NULL DEFAULT 'open',
    "eligibility" "ballot_eligibility" NOT NULL,
    "candidates" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tally_result" JSONB,
    "tallied_by" UUID,
    "tallied_at" TIMESTAMP(3),

    CONSTRAINT "ballot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote" (
    "id" UUID NOT NULL,
    "ballot_id" UUID NOT NULL,
    "voter_hash" TEXT NOT NULL,
    "candidate_person_id" UUID NOT NULL,
    "cast_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ballot_meeting_id_category_key" ON "ballot"("meeting_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "vote_ballot_id_voter_hash_key" ON "vote"("ballot_id", "voter_hash");

-- AddForeignKey
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote" ADD CONSTRAINT "vote_ballot_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "ballot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote" ADD CONSTRAINT "vote_candidate_person_id_fkey" FOREIGN KEY ("candidate_person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
