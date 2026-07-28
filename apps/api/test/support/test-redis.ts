import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import Redis from 'ioredis';

async function start(): Promise<{ container: StartedTestContainer; url: string }> {
  const container = await new GenericContainer('redis:7')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  // Same IPv4-loopback fix as test-db.ts — Docker Desktop's port-forwarding
  // proxy races IPv6 resolution of 'localhost' on some platforms.
  const host = container.getHost() === 'localhost' ? '127.0.0.1' : container.getHost();
  const url = `redis://${host}:${container.getMappedPort(6379)}`;

  return { container, url };
}

/** Suite-level: start once, reuse across tests, stop in afterAll. */
export async function startTestRedis(): Promise<{
  client: Redis;
  stop: () => Promise<void>;
}> {
  const { container, url } = await start();
  const client = new Redis(url);
  return {
    client,
    stop: async () => {
      client.disconnect();
      await container.stop();
    },
  };
}
