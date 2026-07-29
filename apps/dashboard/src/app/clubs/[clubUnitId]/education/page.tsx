import {
  listClubEducationProgress,
  listEducationRecords,
  listMyEvaluations,
  listMentorshipPairings,
  listOnboardingTracks,
  listOnboardingProgress,
} from '@/lib/education';
import { getPathways } from '@/lib/meetings';
import { getSession } from '@/lib/session';
import { EducationProgressTable } from '@/components/education/EducationProgressTable';
import { EducationRecordsPanel } from '@/components/education/EducationRecordsPanel';
import { EvaluationsPanel } from '@/components/education/EvaluationsPanel';
import { MentorshipPanel } from '@/components/education/MentorshipPanel';
import { OnboardingPanel } from '@/components/education/OnboardingPanel';

export default async function ClubEducationPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const session = await getSession();
  const programYearId = session?.programYearId ?? null;

  const [progress, pathways, records, myEvaluations, pairings, tracks, onboardingProgress] =
    await Promise.all([
      listClubEducationProgress(clubUnitId),
      // The seeded catalogue, for the per-member project list in the drawer.
      // Reuses M9's read-only endpoint — no new backend surface.
      getPathways(clubUnitId),
      listEducationRecords(clubUnitId),
      listMyEvaluations(clubUnitId),
      listMentorshipPairings(clubUnitId),
      listOnboardingTracks(clubUnitId),
      listOnboardingProgress(clubUnitId),
    ]);

  return (
    // Wider than the shared `.page` container (40rem): eight columns of
    // roster do not fit in it, and horizontally scrolling on a desktop
    // monitor is a worse default than a wide page.
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1>Education</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every member&rsquo;s Pathways progress. Levels count delivered projects against the
          Pathways catalogue and are only ticked once the VP Education confirms them &mdash; a
          portal projection, never an official Toastmasters International award.
        </p>
      </div>

      <EducationProgressTable rows={progress} pathways={pathways} />

      <section className="flex flex-col gap-3">
        <h2>Level confirmation</h2>
        <EducationRecordsPanel clubUnitId={clubUnitId} records={records} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Evaluations</h2>
        <EvaluationsPanel clubUnitId={clubUnitId} myEvaluations={myEvaluations} />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Mentorship</h2>
        <MentorshipPanel
          clubUnitId={clubUnitId}
          programYearId={programYearId}
          pairings={pairings}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2>Onboarding</h2>
        <OnboardingPanel clubUnitId={clubUnitId} tracks={tracks} progress={onboardingProgress} />
      </section>
    </main>
  );
}
