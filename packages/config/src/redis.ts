/**
 * Turn a REDIS_URL into the connection options BullMQ (ioredis) expects.
 * Lives here so both apps derive Redis config the same way without importing
 * one another (packages must not depend on each other — see CLAUDE.md).
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, unknown>;
}

export function redisConnectionOptions(url: string): RedisConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
