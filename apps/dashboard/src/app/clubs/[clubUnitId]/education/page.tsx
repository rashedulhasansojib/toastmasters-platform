import {
  listEducationRecords,
  listMyEvaluations,
  listMentorshipPairings,
  listOnboardingTracks,
  listOnboardingProgress,
} from '@/lib/education';
import { getSession } from '@/lib/session';
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

  const [records, myEvaluations, pairings, tracks, progress] = await Promise.all([
    listEducationRecords(clubUnitId),
    listMyEvaluations(clubUnitId),
    listMentorshipPairings(clubUnitId),
    listOnboardingTracks(clubUnitId),
    listOnboardingProgress(clubUnitId),
  ]);

  return (
    <main className="page flex flex-col gap-6">
      <h1>Education</h1>

      <section className="flex flex-col gap-3">
        <h2>Education records &amp; level confirmation</h2>
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
        <OnboardingPanel clubUnitId={clubUnitId} tracks={tracks} progress={progress} />
      </section>
    </main>
  );
}
