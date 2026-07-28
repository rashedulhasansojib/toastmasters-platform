import { z } from 'zod';

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
