# M5 — Club Operations (library first, deliberately)

**Goal.** Give every officer a working module home — and build the library **before** education and governance need it. `roadmap.md` §5.

**Depends on.** M4 (receipts link to the ledger; signed-URL storage).

**Ship gate.** Every officer has a working home for their module; a library item past its review date surfaces to its owner.

**Must be right.**

- The library is M5 to avoid retrofitting attachment points across six later contexts (`system-design.md` §15.1).
- Uploads are served **only via signed URLs**, never from the app origin (`FR-LIB-5`).
- Inventory quantity is **derived, not stored** — an append-only movement log, same principle as the ledger (`FR-OPS-2`).
- The content planner **never publishes** — plans and records only (`N5`).

**Already shipped, out of this milestone's remaining scope:** meeting checklist templates/runs (`FR-OPS-1`) — built in M3 Slice 5 (`checklist-template.*`, `checklist-run.*`), including instantiation on meeting publish. Nothing left to build there; M5 only adds the Sergeant-at-Arms role's grant on it.

**Scope note:** same lean-per-slice convention as M3/M4 — short Why + Schema + Scope per slice, not an exhaustive write-up.

**Migration note (per explicit instruction this milestone):** schema changes accumulate across all M5 slices; `prisma generate` runs after each schema edit so types stay accurate, but no `prisma migrate`/`diff` touches the database until M5's schema is fully written — one migration at the end of the milestone.

---

## Slice breakdown

| #   | Slice                                                                                                  | New resource(s)                               |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 1   | Object storage adapter — MinIO/S3 signed URLs, implements the existing `StoragePort`                   | — (infra)                                     |
| 2   | Library — `LibraryItem`, versioning, review dates, visibility                                          | `library.governance_document`, `library.item` |
| 3   | Inventory — `InventoryItem` + append-only `InventoryMovement`, custody                                 | `operations.inventory`                        |
| 4   | Content planner — `ContentPlanItem`, lead-source tag back to prospects                                 | `library.content_plan`                        |
| 5   | New role templates — VP Public Relations, Sergeant at Arms, Secretary + `system-design.md` §7.5 grants | (grants only)                                 |
| 6   | Dashboard UI — library browser/uploader, inventory, content planner calendar/kanban                    | —                                             |

## Design decision: two library resources, not one

`system-design.md` §15.1 says "one model, many views" to avoid tripling the _storage_ surface — but its own §7.5 permission matrix gives governance documents and media/links **different grant rows** (Secretary writes governance docs, VPPR writes media). The five fixed RBAC conditions (`any|own|assigned|party|published`) can't express "same table, different grants by category". Resolution: **one `LibraryItem` table, two `resource_catalog` rows** — `library.governance_document` (filtered to `category='governance'`) and `library.item` (everything else). The model stays one; only the authorization surface splits, which is exactly what the matrix already requires. Documented here rather than guessed silently, matching the M4 precedent for resolving matrix/schema tension.

---

## Slice 1 — Object storage adapter

**Why:** `apps/api/src/common/storage/storage.port.ts` was declared in M1/M4 scaffolding with no implementation, explicitly deferred to M5. The library slice needs it first.

**New dependency:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — S3-compatible, works against MinIO in dev and any S3-compatible bucket in prod, matches the stack table's "S3-compatible in prod" line and the port's own docstring commitment. No alternative already in the tree.

**Files:** `apps/api/src/common/storage/s3-storage.adapter.ts` (implements `StoragePort`, reads `S3_*` from `@toastmasters/config`), registered behind `STORAGE_PORT` in a new `apps/api/src/common/storage/storage.module.ts`, imported once from `AppModule`.

---

## Slice 2 — Library

**Why:** `system-design.md` §15. The root of the milestone.

**Schema:**

```prisma
model LibraryItem {
  id             String    @id @default(uuid()) @db.Uuid
  orgUnitId      String    @map("org_unit_id") @db.Uuid
  orgUnit        OrgUnit   @relation(fields: [orgUnitId], references: [id])
  kind           LibraryItemKind
  title          String
  description    String?
  tags           String[]  @default([])
  category       LibraryItemCategory
  fileUrl        String?   @map("file_url")
  fileMimeType   String?   @map("file_mime_type")
  fileSizeBytes  Int?      @map("file_size_bytes")
  fileChecksum   String?   @map("file_checksum")
  externalUrl    String?   @map("external_url")
  body           String?
  visibility     LibraryItemVisibility @default(officers)
  visibleToRoles String[]  @default([]) @map("visible_to_roles")
  version        Int       @default(1)
  supersedesId   String?   @map("supersedes_id") @db.Uuid
  supersedes     LibraryItem? @relation("LibraryItemVersion", fields: [supersedesId], references: [id])
  supersededBy   LibraryItem[] @relation("LibraryItemVersion")
  isCurrent      Boolean   @default(true) @map("is_current")
  programYearId  String?   @map("program_year_id")
  programYear    ProgramYear? @relation(fields: [programYearId], references: [id])
  reviewBy       DateTime? @map("review_by") @db.Date
  uploadedBy     String    @map("uploaded_by") @db.Uuid
  uploadedByPerson Person  @relation(fields: [uploadedBy], references: [id])
  uploadedAt     DateTime  @default(now()) @map("uploaded_at")
  archivedAt     DateTime? @map("archived_at")

  @@map("library_item")
}
enum LibraryItemKind { document media link note }
enum LibraryItemCategory { governance training branding meeting finance media external other }
enum LibraryItemVisibility { public members officers role_scoped }
```

**API:** `POST /clubs/:clubUnitId/library/upload-url` (signed upload URL) · `POST /clubs/:clubUnitId/library` (create — governance category routes to `library.governance_document`, else `library.item`) · `GET /clubs/:clubUnitId/library?kind=&category=&tag=` · `GET /clubs/:clubUnitId/library/:id/download-url` (signed download URL) · `POST /clubs/:clubUnitId/library/:id/new-version` (governance re-versioning: creates `v+1` with `supersedesId`, flips old `isCurrent=false`) · `POST /clubs/:clubUnitId/library/:id/archive`.

**Scope cut:** the quarterly review-date digest job (notify owner of past-`reviewBy` items) is a worker cron, same shape as M4's prospect-retention job — built in this slice, not deferred, since `FR-LIB-3` is explicitly load-bearing for the ship gate ("a library item past its review date surfaces to its owner"). Delivered as an in-app query (`GET /clubs/:clubUnitId/library?pastReview=true`) surfaced on the dashboard, not an email digest — email delivery is still gated on the same PDF/email-provider decision M3 and M4 deferred.

---

## Slice 3 — Inventory

**Why:** `system-design.md` §14.2. Custody tracking is what makes the 1 July handover work.

**Schema:**

```prisma
model InventoryItem {
  id                     String   @id @default(uuid()) @db.Uuid
  orgUnitId              String   @map("org_unit_id") @db.Uuid
  orgUnit                OrgUnit  @relation(fields: [orgUnitId], references: [id])
  name                   String
  category               InventoryItemCategory
  unit                   String
  condition              InventoryItemCondition @default(good)
  location               String?
  custodianPersonId      String?  @map("custodian_person_id") @db.Uuid
  custodianPerson        Person?  @relation(fields: [custodianPersonId], references: [id])
  acquiredOn             DateTime? @map("acquired_on") @db.Date
  acquisitionLedgerEntryId String? @map("acquisition_ledger_entry_id") @db.Uuid
  acquisitionLedgerEntry LedgerEntry? @relation(fields: [acquisitionLedgerEntryId], references: [id])
  replacementCost        Decimal? @map("replacement_cost") @db.Decimal(10, 2)
  lastAuditedAt          DateTime? @map("last_audited_at")
  notes                  String?
  movements              InventoryMovement[]

  @@map("inventory_item")
}
model InventoryMovement {          // append-only — REVOKE UPDATE, DELETE
  id          String   @id @default(uuid()) @db.Uuid
  itemId      String   @map("item_id") @db.Uuid
  item        InventoryItem @relation(fields: [itemId], references: [id])
  orgUnitId   String   @map("org_unit_id") @db.Uuid
  orgUnit     OrgUnit  @relation(fields: [orgUnitId], references: [id])
  type        InventoryMovementType
  quantity    Int
  byPersonId  String   @map("by_person_id") @db.Uuid
  byPerson    Person   @relation(fields: [byPersonId], references: [id])
  meetingId   String?  @map("meeting_id") @db.Uuid
  meeting     Meeting? @relation(fields: [meetingId], references: [id])
  at          DateTime @default(now())
  note        String?

  @@map("inventory_movement")
}
enum InventoryItemCategory { banner trophy timer_device stationery equipment book signage other }
enum InventoryItemCondition { new good worn damaged lost }
enum InventoryMovementType { acquire checkout return dispose adjust audit }
```

`InventoryItem.quantity` is **not a column** — derived as `SUM(signed quantity)` over its movements (`acquire`/`return`/`adjust(+)` add, `checkout`/`dispose`/`adjust(-)` subtract), same derived-read pattern as `DuesRecord` standing in M4. `checkout` moves custody to `byPersonId` without changing quantity; `return` moves it back to the club's default location.

**API:** `POST /clubs/:clubUnitId/inventory` (create item + optional opening `acquire` movement) · `GET /clubs/:clubUnitId/inventory` (with derived `quantity`, current custodian) · `POST /clubs/:clubUnitId/inventory/:id/movements` · `GET /clubs/:clubUnitId/inventory/:id/movements`.

---

## Slice 4 — Content planner

**Why:** `system-design.md` §15.4. VPPR's calendar; the `leadSourceTag` → `Prospect.leadSource` link is what justifies it existing as a separate model from the library.

**Schema:**

```prisma
model ContentPlanItem {
  id             String   @id @default(uuid()) @db.Uuid
  orgUnitId      String   @map("org_unit_id") @db.Uuid
  orgUnit        OrgUnit  @relation(fields: [orgUnitId], references: [id])
  programYearId  String   @map("program_year_id")
  programYear    ProgramYear @relation(fields: [programYearId], references: [id])
  title          String
  channel        ContentPlanChannel
  scheduledFor   DateTime @map("scheduled_for")
  status         ContentPlanStatus @default(idea)
  copy           String?
  assetIds       String[] @default([]) @map("asset_ids")
  linkedMeetingId String? @map("linked_meeting_id") @db.Uuid
  linkedMeeting  Meeting? @relation(fields: [linkedMeetingId], references: [id])
  assignedToPersonId String? @map("assigned_to_person_id") @db.Uuid
  assignedToPerson Person? @relation(fields: [assignedToPersonId], references: [id])
  publishedUrl   String?  @map("published_url")
  publishedAt    DateTime? @map("published_at")
  leadSourceTag  String?  @map("lead_source_tag")
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("content_plan_item")
}
enum ContentPlanChannel { facebook instagram linkedin website newsletter whatsapp other }
enum ContentPlanStatus { idea drafting ready published cancelled }
```

**API:** `POST /clubs/:clubUnitId/content-plan` · `GET /clubs/:clubUnitId/content-plan?status=&channel=` · `PATCH /clubs/:clubUnitId/content-plan/:id` (status/copy/assets/schedule) · `POST /clubs/:clubUnitId/content-plan/:id/publish` (records `publishedUrl`/`publishedAt` by hand — **never** calls a social API, per `N5`).

**Scope cut:** no calendar-ICS export; the dashboard renders its own calendar/kanban views over the same records.

---

## Slice 5 — Role templates

**Why:** `club_vppr`, `club_saa`, `club_secretary` don't exist yet — M1–M4 never needed them. M5 is the first milestone where their modules exist.

Grants transcribed from `system-design.md` §7.5 for the resources this milestone (and M3's pre-existing `meeting.checklist`) touches:

- **`club_vppr`** (VP Public Relations): `library.item` W, `library.governance_document` R, `library.content_plan` W, `meeting.meeting` R.
- **`club_saa`** (Sergeant at Arms): `operations.inventory` W, `meeting.checklist` W (create/read/update — the existing M3 resource), `library.governance_document` R, `library.item` R.
- **`club_secretary`**: `library.governance_document` W, `library.item` R, `meeting.checklist` R, `identity.role_assignment` R.

Existing role templates gain rows per the same matrix: `club_president` → `library.governance_document` W, `library.item` R, `operations.inventory` R, `library.content_plan` R; `club_vpe` → `library.governance_document` R, `library.item` R; `club_vpm` → `library.governance_document` R, `library.item` R, `library.content_plan` R; `club_treasurer` → `library.governance_document` R, `operations.inventory` R; `club_member` → `library.item` R (public/members visibility is enforced by the `visibility` field inside the service, same layered pattern as meeting guest visibility — the RBAC grant is the coarse gate, the field is the fine one).

---

## Slice 6 — Dashboard UI

Mirrors the M3/M4 pattern exactly: BFF proxy routes under `apps/dashboard/src/app/api/clubs/[clubUnitId]/...`, server-component list pages, `'use client'` forms for mutations. Library gets an upload flow (request signed URL client-side, `PUT` the file directly to the returned URL, then post the metadata record). Content planner gets calendar and kanban views over the same `ContentPlanItem` list, per §15.4's "views: calendar and kanban over the same records."
