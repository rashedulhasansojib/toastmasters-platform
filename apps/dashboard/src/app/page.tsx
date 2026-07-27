import { fetchHealth } from '@/lib/api';

export default async function Home() {
  const health = await fetchHealth().catch(() => null);

  return (
    <main className="page">
      <h1>Toastmasters Platform</h1>
      <p>Phase 0 skeleton. The domain arrives milestone by milestone.</p>
      <section>
        <h2>API health</h2>
        {health ? (
          <p>
            Status: <strong>{health.status}</strong> · uptime {Math.round(health.uptime)}s
          </p>
        ) : (
          <p>
            API not reachable yet — start everything with <code>pnpm dev</code>.
          </p>
        )}
      </section>
    </main>
  );
}
