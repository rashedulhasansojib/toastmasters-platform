import { z } from 'zod';
import { person, clubMembership } from './identity';

/**
 * M4 Slice 1: system-design.md §11.1. Guests are club-local,
 * non-authenticating, VPM-owned. `deleteAfter` is server-computed at create
 * (CLAUDE.md §2 decision 4 — 180 days), never client-supplied.
 */
export const guestPipelineStatus = z.enum([
  'new',
  'contacted',
  'interested',
  'not_interested',
  'joined',
]);
export type GuestPipelineStatus = z.infer<typeof guestPipelineStatus>;

export const guest = z.object({
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
  pipelineStatus: guestPipelineStatus,
  convertedToPersonId: z.uuid().nullable(),
  convertedAt: z.iso.datetime().nullable(),
  deleteAfter: z.iso.datetime(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
  piiRedactedAt: z.iso.datetime().nullable(),
});
export type Guest = z.infer<typeof guest>;

export const createGuestRequestSchema = z
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
export type CreateGuestRequest = z.infer<typeof createGuestRequestSchema>;

/**
 * Excludes `new` (the create-time default) and `joined` (conversion-only,
 * set by a later slice's handler — never a direct client update).
 */
export const updateGuestRequestSchema = z
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
export type UpdateGuestRequest = z.infer<typeof updateGuestRequestSchema>;

/** M4 Slice 2: system-design.md §11.1's `visits`/`communications` arrays, as their own append-only tables. */
export const guestVisit = z.object({
  id: z.uuid(),
  guestId: z.uuid(),
  meetingId: z.uuid(),
  attendedAt: z.iso.datetime(),
  loggedBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type GuestVisit = z.infer<typeof guestVisit>;

export const createGuestVisitRequestSchema = z
  .object({
    meetingId: z.uuid(),
    attendedAt: z.iso.datetime(),
  })
  .strict();
export type CreateGuestVisitRequest = z.infer<typeof createGuestVisitRequestSchema>;

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

export const guestCommunicationChannel = z.enum(['call', 'message', 'email', 'in_person', 'other']);
export type GuestCommunicationChannel = z.infer<typeof guestCommunicationChannel>;

export const guestCommunication = z.object({
  id: z.uuid(),
  guestId: z.uuid(),
  channel: guestCommunicationChannel,
  note: z.string(),
  loggedBy: z.uuid(),
  loggedAt: z.iso.datetime(),
});
export type GuestCommunication = z.infer<typeof guestCommunication>;

export const createGuestCommunicationRequestSchema = z
  .object({
    channel: guestCommunicationChannel,
    note: z.string().min(1),
  })
  .strict();
export type CreateGuestCommunicationRequest = z.infer<typeof createGuestCommunicationRequestSchema>;

/**
 * M4 Slice 4: system-design.md §11.1's conversion — "create-or-attach `Person`
 * → create `ClubMembership` → link → emit `GuestConverted`." `wasExistingPerson`
 * tells the caller whether this matched an existing account (dual membership)
 * or minted a brand-new one.
 */
export const convertGuestResponseSchema = z.object({
  guest,
  person,
  clubMembership,
  wasExistingPerson: z.boolean(),
});
export type ConvertGuestResponse = z.infer<typeof convertGuestResponseSchema>;
