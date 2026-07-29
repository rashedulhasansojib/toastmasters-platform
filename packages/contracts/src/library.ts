import { z } from 'zod';

/**
 * M5 Slice 2: system-design.md §15.1. One model — document archive, media
 * library, links, notes — filtered by `kind`/`category`, not four stores.
 * Authorized by two `resource_catalog` rows (`library.governance_document`,
 * `library.item`) — see the M5 plan doc's "two library resources" note.
 */
export const libraryItemKind = z.enum(['document', 'media', 'link', 'note']);
export type LibraryItemKind = z.infer<typeof libraryItemKind>;

export const libraryItemCategory = z.enum([
  'governance',
  'training',
  'branding',
  'meeting',
  'finance',
  'media',
  'external',
  'other',
]);
export type LibraryItemCategory = z.infer<typeof libraryItemCategory>;

export const libraryItemVisibility = z.enum(['public', 'members', 'officers', 'role_scoped']);
export type LibraryItemVisibility = z.infer<typeof libraryItemVisibility>;

export const libraryItem = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  kind: libraryItemKind,
  title: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  category: libraryItemCategory,
  fileUrl: z.string().nullable(),
  fileMimeType: z.string().nullable(),
  fileSizeBytes: z.number().int().nullable(),
  fileChecksum: z.string().nullable(),
  externalUrl: z.string().nullable(),
  body: z.string().nullable(),
  visibility: libraryItemVisibility,
  visibleToRoles: z.array(z.string()),
  version: z.number().int(),
  supersedesId: z.uuid().nullable(),
  isCurrent: z.boolean(),
  programYearId: z.string().nullable(),
  reviewBy: z.iso.date().nullable(),
  uploadedBy: z.uuid(),
  uploadedAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});
export type LibraryItem = z.infer<typeof libraryItem>;

/** Requested before upload; the client `PUT`s the file straight to the returned URL — the app never proxies bytes (`FR-LIB-5`). */
export const librarySignedUploadUrlRequestSchema = z
  .object({ contentType: z.string().min(1) })
  .strict();
export type LibrarySignedUploadUrlRequest = z.infer<typeof librarySignedUploadUrlRequestSchema>;

export const librarySignedUploadUrlResponseSchema = z.object({
  url: z.string(),
  key: z.string(),
});
export type LibrarySignedUploadUrlResponse = z.infer<typeof librarySignedUploadUrlResponseSchema>;

export const librarySignedDownloadUrlResponseSchema = z.object({ url: z.string() });
export type LibrarySignedDownloadUrlResponse = z.infer<
  typeof librarySignedDownloadUrlResponseSchema
>;

export const createLibraryItemRequestSchema = z
  .object({
    kind: libraryItemKind,
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    tags: z.array(z.string()).default([]),
    category: libraryItemCategory,
    fileUrl: z.string().min(1).optional(),
    fileMimeType: z.string().min(1).optional(),
    fileSizeBytes: z.number().int().positive().optional(),
    fileChecksum: z.string().min(1).optional(),
    externalUrl: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    visibility: libraryItemVisibility.default('officers'),
    visibleToRoles: z.array(z.string()).default([]),
    programYearId: z.string().min(1).optional(),
    reviewBy: z.iso.date().optional(),
  })
  .strict();
export type CreateLibraryItemRequest = z.infer<typeof createLibraryItemRequestSchema>;

/** Governance documents are always `category: 'governance'` — forced server-side, not client-supplied, so the item/governance route split can't be bypassed by a client just setting the field. */
export const createGovernanceDocumentRequestSchema = createLibraryItemRequestSchema
  .omit({ category: true })
  .strict();
export type CreateGovernanceDocumentRequest = z.infer<typeof createGovernanceDocumentRequestSchema>;

/** A governance-document re-version — creates `v+1` with `supersedesId`, flips the old row's `isCurrent` (I-17). Non-governance items may also gain a version; the endpoint doesn't distinguish. */
export const newLibraryItemVersionRequestSchema = z
  .object({
    fileUrl: z.string().min(1).optional(),
    fileMimeType: z.string().min(1).optional(),
    fileSizeBytes: z.number().int().positive().optional(),
    fileChecksum: z.string().min(1).optional(),
    externalUrl: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    reviewBy: z.iso.date().optional(),
  })
  .strict();
export type NewLibraryItemVersionRequest = z.infer<typeof newLibraryItemVersionRequestSchema>;

/**
 * M5 Slice 4: system-design.md §15.4. Distinct from the library — plans
 * *when* things go out, referencing library items as assets. Never
 * publishes directly (N5); `publish` only records a URL after a human posts
 * it by hand.
 */
export const contentPlanChannel = z.enum([
  'facebook',
  'instagram',
  'linkedin',
  'website',
  'newsletter',
  'whatsapp',
  'other',
]);
export type ContentPlanChannel = z.infer<typeof contentPlanChannel>;

export const contentPlanStatus = z.enum(['idea', 'drafting', 'ready', 'published', 'cancelled']);
export type ContentPlanStatus = z.infer<typeof contentPlanStatus>;

export const contentPlanItem = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  programYearId: z.string(),
  title: z.string(),
  channel: contentPlanChannel,
  scheduledFor: z.iso.datetime(),
  status: contentPlanStatus,
  copy: z.string().nullable(),
  assetIds: z.array(z.uuid()),
  linkedMeetingId: z.uuid().nullable(),
  assignedToPersonId: z.uuid().nullable(),
  publishedUrl: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  leadSourceTag: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ContentPlanItem = z.infer<typeof contentPlanItem>;

export const createContentPlanItemRequestSchema = z
  .object({
    programYearId: z.string().min(1),
    title: z.string().min(1),
    channel: contentPlanChannel,
    scheduledFor: z.iso.datetime(),
    copy: z.string().min(1).optional(),
    assetIds: z.array(z.uuid()).default([]),
    linkedMeetingId: z.uuid().optional(),
    assignedToPersonId: z.uuid().optional(),
    leadSourceTag: z.string().min(1).optional(),
  })
  .strict();
export type CreateContentPlanItemRequest = z.infer<typeof createContentPlanItemRequestSchema>;

export const updateContentPlanItemRequestSchema = z
  .object({
    title: z.string().min(1).optional(),
    status: contentPlanStatus.optional(),
    copy: z.string().min(1).optional(),
    assetIds: z.array(z.uuid()).optional(),
    scheduledFor: z.iso.datetime().optional(),
    assignedToPersonId: z.uuid().optional(),
  })
  .strict();
export type UpdateContentPlanItemRequest = z.infer<typeof updateContentPlanItemRequestSchema>;

/** `publish` is a record of what happened, never a call to a social API (N5). */
export const publishContentPlanItemRequestSchema = z
  .object({ publishedUrl: z.string().min(1) })
  .strict();
export type PublishContentPlanItemRequest = z.infer<typeof publishContentPlanItemRequestSchema>;
