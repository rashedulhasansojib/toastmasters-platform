import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchHealth } from '@/lib/api';
import { getSession } from '@/lib/session';
import { unitLandingPath } from '@/components/app-shell/nav-config';
import { vpmLandingOverride } from '@/lib/membership-landing';

export default async function Home() {
  const session = await getSession();

  // A person with a club lands in the club, not on the welcome page — the
  // session already resolved which club that is (AuthService.defaultActiveUnit),
  // so there is nothing to pick.
  if (session?.activeUnit?.type === 'club') {
    const landing =
      (await vpmLandingOverride(session.activeUnit.id)) ?? unitLandingPath(session.activeUnit);
    if (landing) redirect(landing);
  }

  const health = await fetchHealth().catch(() => null);
  const landing = session?.activeUnit ? unitLandingPath(session.activeUnit) : null;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-3xl flex-col items-center justify-center px-6 py-20 text-center">
      <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#EBD9C8] bg-[#FAF3EC] px-4 py-1.5 text-xs font-semibold tracking-wide text-[#772432] uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-[#772432]" />
        Phase 0 skeleton
      </span>

      <h1 className="text-4xl font-semibold tracking-tight text-[#2A1418] sm:text-5xl">
        Welcome to Toastie
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        Club and district management for Toastmasters — meetings, membership, finance, and
        oversight, built one milestone at a time.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {session ? (
          <>
            <p className="text-sm text-muted-foreground">
              Welcome back, <span className="font-medium text-foreground">{session.fullName}</span>
            </p>
            {landing && session.activeUnit && (
              <Link
                href={landing}
                className="inline-flex items-center gap-2 rounded-xl bg-[#772432] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5c1c27]"
              >
                Go to {session.activeUnit.name}
              </Link>
            )}
          </>
        ) : (
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-[#772432] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5c1c27]"
          >
            Log in
          </Link>
        )}
      </div>

      <div className="mt-14 w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          API health
        </p>
        {health ? (
          <p className="mt-2 flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-foreground">{health.status}</span>
            <span className="text-muted-foreground">· uptime {Math.round(health.uptime)}s</span>
          </p>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
            API not reachable yet — start everything with <code>pnpm dev</code>.
          </p>
        )}
      </div>
    </main>
  );
}
