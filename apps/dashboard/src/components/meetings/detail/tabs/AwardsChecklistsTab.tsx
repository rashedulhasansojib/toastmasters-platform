'use client';

import type { Ballot, ChecklistRun, ChecklistTemplate } from '@toastmasters/contracts';
import { StartChecklistRunButton } from '@/components/checklists/StartChecklistRunButton';
import { ChecklistRunsList } from '@/components/checklists/ChecklistRunsList';
import { CreateBallotForm } from '@/components/ballots/CreateBallotForm';
import { BallotsList } from '@/components/ballots/BallotsList';
import { Section } from '../primitives';

/**
 * Checklists and award ballots.
 *
 * The legacy portal had neither, so there is no tab in it to copy — but the
 * platform does have both, and they belong to the meeting. Rather than drop
 * them when the page moved to the legacy tab layout, they live here, next
 * to the rest of the meeting's run-of-show.
 */
export function AwardsChecklistsTab({
  clubUnitId,
  meetingId,
  checklistTemplates,
  checklistRuns,
  ballots,
}: {
  clubUnitId: string;
  meetingId: string;
  checklistTemplates: ChecklistTemplate[];
  checklistRuns: ChecklistRun[];
  ballots: Ballot[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Section title="Checklists">
        <div className="flex flex-col gap-3">
          <StartChecklistRunButton
            clubUnitId={clubUnitId}
            meetingId={meetingId}
            templates={checklistTemplates}
          />
          <ChecklistRunsList clubUnitId={clubUnitId} meetingId={meetingId} runs={checklistRuns} />
        </div>
      </Section>

      <Section title="Award Ballots" defaultOpen={ballots.length > 0}>
        <div className="flex flex-col gap-3">
          <CreateBallotForm clubUnitId={clubUnitId} meetingId={meetingId} />
          <BallotsList clubUnitId={clubUnitId} meetingId={meetingId} ballots={ballots} />
        </div>
      </Section>
    </div>
  );
}
