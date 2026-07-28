-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as prior
-- migrations: both are hand-added on the Unsupported("ltree") `path` column,
-- invisible to Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "capability_token" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "capability_token_token_hash_key" ON "capability_token"("token_hash");

-- AddForeignKey
ALTER TABLE "capability_token" ADD CONSTRAINT "capability_token_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_token" ADD CONSTRAINT "capability_token_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
