import { z } from 'zod';
import { person, clubMembership } from './identity';

/**
 * M4 Slice 1: system-design.md §11.1. Guests are club-local,
 * non-authenticating, VPM-owned. `deleteAfter` is server-computed at create
 * (CLAUDE.md §2 decision 4 — 180 days), never client-supplied.
 */
export const prospectPipelineStatus = z.enum([
  'new',
  'contacted',
  'interested',
  'not_interested',
  'joined',
]);
export type ProspectPipelineStatus = z.infer<typeof prospectPipelineStatus>;

export const prospect = z.object({
  id: z.uuid(),
  orgUnitId: z.uuid(),
  fullName: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  photoUrl: z.string().nullable(),
  bio: z.string().nullable(),
  leadSource: z.string().nullable(),
  preferredRole: z.string().nullable(),
  pipelineStatus: prospectPipelineStatus,
  convertedToPersonId: z.uuid().nullable(),
  convertedAt: z.iso.datetime().nullable(),
  deleteAfter: z.iso.datetime(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
  piiRedactedAt: z.iso.datetime().nullable(),
});
export type Prospect = z.infer<typeof prospect>;

export const createProspectRequestSchema = z
  .object({
    fullName: z.string().min(1),
    email: z.email().optional(),
    phone: z.string().min(1).optional(),
    whatsapp: z.string().min(1).optional(),
    photoUrl: z.string().min(1).optional(),
    bio: z.string().min(1).optional(),
    leadSource: z.string().min(1).optional(),
    preferredRole: z.string().min(1).optional(),
  })
  .strict();
export type CreateProspectRequest = z.infer<typeof createProspectRequestSchema>;

/**
 * Excludes `new` (the create-time default) and `joined` (conversion-only,
 * set by a later slice's handler — never a direct client update).
 */
export const updateProspectRequestSchema = z
  .object({
    pipelineStatus: z.enum(['contacted', 'interested', 'not_interested']).optional(),
    email: z.email().optional(),
    phone: z.string().min(1).optional(),
    whatsapp: z.string().min(1).optional(),
    photoUrl: z.string().min(1).optional(),
    bio: z.string().min(1).optional(),
    leadSource: z.string().min(1).optional(),
    preferredRole: z.string().min(1).optional(),
  })
  .strict();
export type UpdateProspectRequest = z.infer<typeof updateProspectRequestSchema>;

/** M4 Slice 2: system-design.md §11.1's `visits`/`communications` arrays, as their own append-only tables. */
export const prospectVisit = z.object({
  id: z.uuid(),
  prospectId: z.uuid(),
  meetingId: z.uuid(),
  attendedAt: z.iso.datetime(),
  loggedBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type ProspectVisit = z.infer<typeof prospectVisit>;

export const createProspectVisitRequestSchema = z
  .object({
    meetingId: z.uuid(),
    attendedAt: z.iso.datetime(),
  })
  .strict();
export type CreateProspectVisitRequest = z.infer<typeof createProspectVisitRequestSchema>;

/**
 * M4 Slice 10: the public guest-join form. CLAUDE.md §1: "Never make a
 * guest authenticate — every guest interaction runs through the single
 * capability-token primitive." This is why this endpoint takes a token
 * (issued by an officer with purpose `guest_register`, meeting-scoped) and
 * not a bare `clubUnitId` — a fully open, unauthenticated write endpoint
 * would be exactly the ad hoc guest path that rule forbids.
 */
export const publicGuestRegistrationRequestSchema = z
  .object({
    fullName: z.string().min(1),
    email: z.email().optional(),
    phone: z.string().min(1).optional(),
    whatsapp: z.string().min(1).optional(),
  })
  .strict();
export type PublicGuestRegistrationRequest = z.infer<typeof publicGuestRegistrationRequestSchema>;

export const prospectCommunicationChannel = z.enum([
  'call',
  'message',
  'email',
  'in_person',
  'other',
]);
export type ProspectCommunicationChannel = z.infer<typeof prospectCommunicationChannel>;

export const prospectCommunication = z.object({
  id: z.uuid(),
  prospectId: z.uuid(),
  channel: prospectCommunicationChannel,
  note: z.string(),
  loggedBy: z.uuid(),
  loggedAt: z.iso.datetime(),
});
export type ProspectCommunication = z.infer<typeof prospectCommunication>;

export const createProspectCommunicationRequestSchema = z
  .object({
    channel: prospectCommunicationChannel,
    note: z.string().min(1),
  })
  .strict();
export type CreateProspectCommunicationRequest = z.infer<
  typeof createProspectCommunicationRequestSchema
>;

/**
 * M4 Slice 4: system-design.md §11.1's conversion — "create-or-attach `Person`
 * → create `ClubMembership` → link → emit `GuestConverted`." `wasExistingPerson`
 * tells the caller whether this matched an existing account (dual membership)
 * or minted a brand-new one.
 */
export const convertProspectResponseSchema = z.object({
  prospect,
  person,
  clubMembership,
  wasExistingPerson: z.boolean(),
});
export type ConvertProspectResponse = z.infer<typeof convertProspectResponseSchema>;
