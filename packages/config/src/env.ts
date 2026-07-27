import { z } from 'zod';

/**
 * The single source of truth for environment configuration. Apps call
 * `parseEnv()` once at boot; if anything is missing or malformed the process
 * fails fast with a readable list of problems (never a mysterious crash later).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),

  API_PORT: z.coerce.number().int().positive().default(4000),

  // Postgres (Neon): pooled endpoint for the app, direct endpoint for migrations.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required'),

  // Redis / BullMQ.
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Argon2id hashes passwords; jose signs httpOnly session tokens with this secret.
  SESSION_JWT_SECRET: z.string().min(32, 'SESSION_JWT_SECRET must be at least 32 characters'),
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 12),

  // Comma-separated CORS origin allowlist -> string[].
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((raw) =>
      raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Object storage (MinIO in dev / S3-compatible in prod). Optional until M5.
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Email: console transport in dev; provider behind EmailPort in prod.
  EMAIL_FROM: z.email().default('no-reply@toastmasters.local'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
