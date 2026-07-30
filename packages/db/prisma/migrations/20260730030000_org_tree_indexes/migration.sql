-- Supports the org-tree browser's per-card counts: grouping org_unit by
-- parent_id (child-unit counts) and club_membership by (club_unit_id,
-- local_status) (active member counts). Neither existed before — Postgres
-- does not auto-index foreign-key columns, and Prisma only adds one when
-- declared with @@index.
CREATE INDEX "org_unit_parent_id_idx" ON "org_unit" ("parent_id");

CREATE INDEX "club_membership_club_unit_id_local_status_idx" ON "club_membership" ("club_unit_id", "local_status");
