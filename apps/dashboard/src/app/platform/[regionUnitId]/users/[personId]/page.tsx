import { getPersonDetail, getProgramYear, getRoleTemplates } from '@/lib/people';
import { getPlatformConsole } from '@/lib/platform';
import { UserDetailView } from '@/components/platform/UserDetailView';

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ regionUnitId: string; personId: string }>;
}) {
  const { regionUnitId, personId } = await params;
  const [detail, roleTemplates, console] = await Promise.all([
    getPersonDetail(personId, regionUnitId),
    getRoleTemplates(),
    getPlatformConsole(regionUnitId),
  ]);

  if (!detail) {
    return (
      <main className="page">
        <h1>User not found</h1>
        <p className="text-sm text-muted-foreground">
          Either this person doesn&apos;t exist, or they&apos;re outside what you can see.
        </p>
      </main>
    );
  }

  const programYear = console?.programYearId ? await getProgramYear(console.programYearId) : null;

  return (
    <main className="page">
      <UserDetailView
        regionUnitId={regionUnitId}
        detail={detail}
        roleTemplates={roleTemplates}
        defaultProgramYearId={console?.programYearId ?? null}
        programYear={programYear}
      />
    </main>
  );
}
