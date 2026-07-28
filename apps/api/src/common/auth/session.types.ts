/**
 * The session JWT's claims (rbac-design.md §5 + the M1 roadmap's Slice 8
 * entry). Deliberately holds no roles/grants — CLAUDE.md: "Permissions are
 * never embedded in the JWT." `v` is the person's permissionVersion at
 * issuance, carried forward verbatim on a unit switch.
 */
export interface SessionClaims {
  sub: string;
  activeUnitId: string | null;
  programYearId: string | null;
  v: number;
}
