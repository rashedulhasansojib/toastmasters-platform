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

/** M3 Slice 1: system-design.md §9.1's agendaItem[] — position is server-assigned, never client-supplied. */
export const agendaItem = z.object({
  id: z.uuid(),
  meetingId: z.uuid(),
  position: z.number().int().positive(),
  title: z.string().min(1),
  plannedDurationSeconds: z.number().int().positive(),
  roleKey: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AgendaItem = z.infer<typeof agendaItem>;

export const createAgendaItemRequestSchema = z
  .object({
    title: z.string().min(1),
    plannedDurationSeconds: z.number().int().positive(),
    roleKey: z.string().min(1).optional(),
  })
  .strict();
export type CreateAgendaItemRequest = z.infer<typeof createAgendaItemRequestSchema>;
