-- Rename Prospect -> Guest across the schema.
--
-- Written by hand rather than diff-generated on purpose: `prisma migrate diff`
-- models a rename as DROP + CREATE, which would destroy every guest row and
-- cascade into their visit/communication history. These are RENAMEs, so all
-- data survives untouched.
--
-- Every step is guarded on its *old* name still being present, which makes the
-- migration idempotent. That matters for two reasons: Prisma does not wrap a
-- migration file in a transaction, so a mid-file failure leaves the earlier
-- statements committed and the file has to be safe to re-run; and Postgres
-- carries indexes and constraints through a table rename while keeping their
-- old names, so each one needs renaming explicitly or the next `migrate diff`
-- reports drift against a schema that is actually correct.

-- ---------------------------------------------------------------- tables
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'prospect' AND relkind = 'r') THEN
    ALTER TABLE "prospect" RENAME TO "guest";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'prospect_visit' AND relkind = 'r') THEN
    ALTER TABLE "prospect_visit" RENAME TO "guest_visit";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'prospect_communication' AND relkind = 'r') THEN
    ALTER TABLE "prospect_communication" RENAME TO "guest_communication";
  END IF;
END $$;

-- --------------------------------------------------------------- columns
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'guest_visit' AND column_name = 'prospect_id') THEN
    ALTER TABLE "guest_visit" RENAME COLUMN "prospect_id" TO "guest_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'guest_communication' AND column_name = 'prospect_id') THEN
    ALTER TABLE "guest_communication" RENAME COLUMN "prospect_id" TO "guest_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meeting_guest' AND column_name = 'prospect_id') THEN
    ALTER TABLE "meeting_guest" RENAME COLUMN "prospect_id" TO "guest_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'speech_evaluation' AND column_name = 'speaker_prospect_id') THEN
    ALTER TABLE "speech_evaluation" RENAME COLUMN "speaker_prospect_id" TO "speaker_guest_id";
  END IF;
END $$;

-- ----------------------------------------------------------------- enums
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prospect_pipeline_status') THEN
    ALTER TYPE "prospect_pipeline_status" RENAME TO "guest_pipeline_status";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prospect_communication_channel') THEN
    ALTER TYPE "prospect_communication_channel" RENAME TO "guest_communication_channel";
  END IF;
END $$;

-- -------------------------------------------------- constraints (PK / FK)
DO $$
DECLARE
  pair RECORD;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('guest',              'prospect_pkey',                            'guest_pkey'),
      ('guest_visit',        'prospect_visit_pkey',                      'guest_visit_pkey'),
      ('guest_communication','prospect_communication_pkey',              'guest_communication_pkey'),
      ('guest',              'prospect_org_unit_id_fkey',                'guest_org_unit_id_fkey'),
      ('guest',              'prospect_converted_to_person_id_fkey',     'guest_converted_to_person_id_fkey'),
      ('guest',              'prospect_created_by_fkey',                 'guest_created_by_fkey'),
      ('guest_visit',        'prospect_visit_prospect_id_fkey',          'guest_visit_guest_id_fkey'),
      ('guest_visit',        'prospect_visit_meeting_id_fkey',           'guest_visit_meeting_id_fkey'),
      ('guest_visit',        'prospect_visit_logged_by_fkey',            'guest_visit_logged_by_fkey'),
      ('guest_communication','prospect_communication_prospect_id_fkey',  'guest_communication_guest_id_fkey'),
      ('guest_communication','prospect_communication_logged_by_fkey',    'guest_communication_logged_by_fkey'),
      ('meeting_guest',      'meeting_guest_prospect_id_fkey',           'meeting_guest_guest_id_fkey'),
      ('speech_evaluation',  'speech_evaluation_speaker_prospect_id_fkey','speech_evaluation_speaker_guest_id_fkey')
    ) AS t(tbl, old_name, new_name)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = pair.old_name) THEN
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', pair.tbl, pair.old_name, pair.new_name);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------- unique indexes
-- Prisma's `@@unique` emits CREATE UNIQUE INDEX, not a table constraint, so
-- these are ALTER INDEX rather than ALTER TABLE ... RENAME CONSTRAINT.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'prospect_visit_prospect_id_meeting_id_key' AND relkind = 'i') THEN
    ALTER INDEX "prospect_visit_prospect_id_meeting_id_key" RENAME TO "guest_visit_guest_id_meeting_id_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'meeting_guest_meeting_id_prospect_id_key' AND relkind = 'i') THEN
    ALTER INDEX "meeting_guest_meeting_id_prospect_id_key" RENAME TO "meeting_guest_meeting_id_guest_id_key";
  END IF;
END $$;

-- ------------------------------------------------- seeded resource key
-- `resource_catalog.resource` is the primary key that role_template_grant,
-- person_grant and unit_policy_grant all reference ON UPDATE CASCADE, so this
-- single statement carries every existing grant to the new key. Without it,
-- `authorize()` would deny every VPM on the guest pipeline the moment the
-- renamed code shipped.
UPDATE "resource_catalog" SET "resource" = 'membership.guest' WHERE "resource" = 'membership.prospect';
