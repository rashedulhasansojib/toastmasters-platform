-- Users admin (super-admin People search + club-scoped invitations that also
-- carry membership intent).

-- Invitation gains an optional member_type: only meaningful when the target
-- org_unit is a club (accept() upserts an active ClubMembership alongside the
-- RoleAssignment when set). Null preserves the original invitation shape for
-- district/division/area-tier invites.
ALTER TABLE "invitation" ADD COLUMN "member_type" "ClubMemberType";

-- Person search (by name / TI member number) for the Users admin table.
-- email already has an index via its UNIQUE constraint.
CREATE INDEX "person_full_name_idx" ON "person" ("full_name");
CREATE INDEX "person_ti_member_number_idx" ON "person" ("ti_member_number");

-- "Pending invitations for this unit's subtree" (Users admin's invitation
-- status column) and "does this email already have a pending invite" both
-- filter on (email, status).
CREATE INDEX "invitation_email_status_idx" ON "invitation" ("email", "status");
