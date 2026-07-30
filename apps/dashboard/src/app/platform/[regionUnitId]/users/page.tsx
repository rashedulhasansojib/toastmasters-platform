import { searchPeople, getRoleTemplates } from '@/lib/people';
import { getPlatformConsole } from '@/lib/platform';
import { UsersTable } from '@/components/platform/UsersTable';
import { AddUserDialogLauncher } from '@/components/platform/AddUserDialog';

/** Users admin — super-admin People search/add/edit (system_admin, or a subtree-scoped unit_admin/support_readonly). */
export default async function UsersPage({ params }: { params: Promise<{ regionUnitId: string }> }) {
  const { regionUnitId } = await params;
  const [result, roleTemplates, console] = await Promise.all([
    searchPeople(regionUnitId, { limit: 100 }),
    getRoleTemplates(),
    getPlatformConsole(regionUnitId),
  ]);

  if (!result) {
    return (
      <main className="page">
        <h1>Users</h1>
        <p className="text-sm text-muted-foreground">You do not have access to the Users admin.</p>
      </main>
    );
  }

  return (
    <main className="page flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1>Users</h1>
        <AddUserDialogLauncher
          regionUnitId={regionUnitId}
          roleTemplates={roleTemplates}
          defaultProgramYearId={console?.programYearId ?? null}
        />
      </div>
      <UsersTable
        regionUnitId={regionUnitId}
        anchorOrgUnitId={regionUnitId}
        initialItems={result.items}
        initialTotal={result.total}
      />
    </main>
  );
}
