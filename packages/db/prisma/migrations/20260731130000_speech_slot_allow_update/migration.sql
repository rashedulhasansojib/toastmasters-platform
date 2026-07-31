-- ------------------------------------------------- seeded vocabulary fix
-- `meeting.speech_slot` allowed `read`, `create` and `approve`, but not
-- `update` — even though club_vpe was granted `meeting.speech_slot:update`
-- and the PATCH/DELETE routes gate on it.
--
-- Domain roles read role_template_grant rows directly, so club_vpe was
-- unaffected. system_admin is not: it holds no seeded grants, and its
-- resolution is synthesised from resource_catalog.allowed_actions over every
-- non-restricted resource (apps/api/src/modules/access/access.repository.ts,
-- systemAdminGrants). With `update` absent from this list the grant was never
-- produced, so system_admin could not edit or remove a speech slot.
--
-- This runs as a migration rather than relying on the seed because seeding is
-- deliberately off by default on deploy (CLAUDE.md §10.6) — reference data is
-- editable in production without a deploy, so a reseed would clobber those
-- edits. Same reasoning as the membership.prospect -> membership.guest rename.
--
-- Idempotent: array_append only fires where the value is absent.
UPDATE "resource_catalog"
SET "allowed_actions" = array_append("allowed_actions", 'update'::"PermissionAction")
WHERE "resource" = 'meeting.speech_slot'
  AND NOT ('update' = ANY ("allowed_actions"));
