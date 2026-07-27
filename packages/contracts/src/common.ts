import { z } from 'zod';

/**
 * Cross-cutting schemas shared by every bounded context. Domain contracts
 * (meetings, members, finance, …) get their own files here as each milestone
 * lands. Everything that crosses the wire is validated against a schema in
 * this package — controllers never trust raw input.
 */

/** Offset pagination accepted by list endpoints. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** A route parameter that must be a UUID. */
export const idParamSchema = z.object({
  id: z.uuid(),
});
export type IdParam = z.infer<typeof idParamSchema>;

/** Payload returned by `GET /health`. Shared so the dashboard parses it too. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
