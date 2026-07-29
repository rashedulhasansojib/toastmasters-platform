import { redirect } from 'next/navigation';
import { getChecklistTemplates, getMeetingTemplates, listMeetings } from '@/lib/meetings';
import { getSession } from '@/lib/session';
import { MeetingsList } from '@/components/meetings/MeetingsList';
import { MeetingTemplatesSection } from '@/components/meetings/MeetingTemplatesSection';
import { NewMeetingDialog } from '@/components/meetings/NewMeetingDialog';
import { ChecklistTemplatesList } from '@/components/checklists/ChecklistTemplatesList';
import { CreateChecklistTemplateForm } from '@/components/checklists/CreateChecklistTemplateForm';
import { Separator } from '@/components/ui/separator';

export default async function ClubMeetingsPage({
  params,
}: {
  params: Promise<{ clubUnitId: string }>;
}) {
  const { clubUnitId } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const [meetings, meetingTemplates, checklistTemplates] = await Promise.all([
    listMeetings(clubUnitId),
    getMeetingTemplates(clubUnitId),
    getChecklistTemplates(clubUnitId),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meetings</h1>
          <p className="text-sm text-muted-foreground">Plan, run and archive club meetings.</p>
        </div>
        <NewMeetingDialog
          clubUnitId={clubUnitId}
          programYearId={session.programYearId ?? null}
          templates={meetingTemplates}
        />
      </div>

      <MeetingsList clubUnitId={clubUnitId} meetings={meetings} />

      <Separator />

      <MeetingTemplatesSection clubUnitId={clubUnitId} templates={meetingTemplates} />

      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Checklist templates
        </summary>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <CreateChecklistTemplateForm clubUnitId={clubUnitId} />
          <ChecklistTemplatesList templates={checklistTemplates} />
        </div>
      </details>
    </main>
  );
}
