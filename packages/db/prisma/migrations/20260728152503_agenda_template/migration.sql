-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as prior
-- migrations: both are hand-added on the Unsupported("ltree") `path` column,
-- invisible to Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "agenda_template" (
    "id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_template_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "agenda_template" ADD CONSTRAINT "agenda_template_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
