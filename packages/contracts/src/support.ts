import { z } from 'zod';

/**
 * M8 Slice 5: system-design.md §17, FR-SUP-1/2. Opt-in, not opt-out;
 * coarse geohash only — never raw coordinates. Requesters see a distance
 * band, not a pin.
 */
export const supportLocation = z.object({
  label: z.enum(['home', 'office']),
  geohash: z.string().length(5),
  precision: z.literal(5),
});
export type SupportLocation = z.infer<typeof supportLocation>;

export const supportProfile = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  isDiscoverable: z.boolean(),
  consentAt: z.iso.datetime().nullable(),
  consentVersion: z.string().nullable(),
  locations: z.array(supportLocation),
  availableRoles: z.array(z.string()),
  mentorFor: z.array(z.string()),
  maxTravelKm: z.number().int().nullable(),
  blackoutDates: z.array(z.iso.date()),
});
export type SupportProfile = z.infer<typeof supportProfile>;

export const setSupportProfileRequestSchema = z
  .object({
    isDiscoverable: z.boolean(),
    consentVersion: z.string().min(1).optional(),
    locations: z.array(supportLocation).default([]),
    availableRoles: z.array(z.string()).default([]),
    mentorFor: z.array(z.string()).default([]),
    maxTravelKm: z.number().int().positive().optional(),
    blackoutDates: z.array(z.iso.date()).default([]),
  })
  .strict();
export type SetSupportProfileRequest = z.infer<typeof setSupportProfileRequestSchema>;

export const supportInviteeResponse = z.enum(['pending', 'accepted', 'declined']);
export type SupportInviteeResponse = z.infer<typeof supportInviteeResponse>;

export const supportInvitee = z.object({
  personId: z.uuid(),
  invitedAt: z.iso.datetime(),
  response: supportInviteeResponse,
  respondedAt: z.iso.datetime().nullable(),
});
export type SupportInvitee = z.infer<typeof supportInvitee>;

export const supportRequestStatus = z.enum(['open', 'filled', 'expired', 'cancelled']);
export type SupportRequestStatus = z.infer<typeof supportRequestStatus>;

export const supportRequest = z.object({
  id: z.uuid(),
  requestingUnitId: z.uuid(),
  meetingId: z.uuid(),
  roleKey: z.string(),
  neededBy: z.iso.datetime(),
  invitees: z.array(supportInvitee),
  status: supportRequestStatus,
  createdAt: z.iso.datetime(),
});
export type SupportRequest = z.infer<typeof supportRequest>;

/** Invitees are matched by coarse geohash-prefix band, never an exact distance — see the M8 plan doc's scope-cut note. */
export const createSupportRequestSchema = z
  .object({ meetingId: z.uuid(), roleKey: z.string().min(1), neededBy: z.iso.datetime() })
  .strict();
export type CreateSupportRequest = z.infer<typeof createSupportRequestSchema>;

export const respondSupportRequestSchema = z
  .object({ response: z.enum(['accepted', 'declined']) })
  .strict();
export type RespondSupportRequest = z.infer<typeof respondSupportRequestSchema>;
