import { Skeleton } from '@/components/ui/skeleton';

/** Instant navigation feedback for a route segment's loading.tsx, shown while its Server Component data fetch is in flight. */
export function RouteLoading() {
  return (
    <main className="page flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-48" />
      {[0, 1].map((section) => (
        <section key={section} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        </section>
      ))}
    </main>
  );
}
