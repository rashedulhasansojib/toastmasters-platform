import { z } from 'zod';

/**
 * Deliberately bare (Slice 9 of the M1 walking-skeleton plan): a record to
 * hang authorization on, not the full meeting-operations entity
 * (system-design.md's agenda/roles/speech-slots/lifecycle) — that's a later
 * milestone.
 */
export const meeting = z.object({
  id: z.uuid(),
  clubUnitId: z.uuid(),
  programYearId: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  createdBy: z.uuid(),
  createdAt: z.iso.datetime(),
});
export type Meeting = z.infer<typeof meeting>;

export const createMeetingRequestSchema = z
  .object({
    programYearId: z.string().min(1),
    scheduledAt: z.iso.datetime(),
  })
  .strict();
export type CreateMeetingRequest = z.infer<typeof createMeetingRequestSchema>;
