/**
 * DI token for the shared PrismaClient. `PrismaClient` is imported type-only
 * from `@toastmasters/db` (the package deliberately doesn't export it as a
 * value — CLAUDE.md: never `new PrismaClient()` ad hoc), so Nest cannot derive
 * an injection token from the type alone. Mirrors `REDIS_CLIENT`.
 */
export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');
