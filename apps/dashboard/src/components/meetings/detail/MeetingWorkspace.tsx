'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Printer,
  Save,
  TriangleAlert,
  UserPlus,
} from 'lucide-react';
import type {
  Ballot,
  ChecklistRun,
  ChecklistTemplate,
  ClubMemberSummary,
  Meeting,
  MeetingAttendanceRosterEntry,
  MeetingGuest,
  MeetingLiveRecord,
  MeetingResource,
  MeetingRoleAssignment,
  PathwayPath,
  Guest,
  SpeechSlot,
} from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MeetingStatusActions } from '../MeetingStatusActions';
import { MembersProvider } from './MembersContext';
import { useMeetingDraft } from './useMeetingDraft';
import { SaveAsTemplateButton } from './SaveAsTemplateButton';
import { AgendaTab } from './tabs/AgendaTab';
import { TableTopicsTab } from './tabs/TableTopicsTab';
import { GuestListTab } from './tabs/GuestListTab';
import { AttendanceTab } from './tabs/AttendanceTab';
import { ResourcesTab } from './tabs/ResourcesTab';
import { TimerReportTab } from './tabs/TimerReportTab';
import { AhCounterTab } from './tabs/AhCounterTab';
import { GrammarianTab } from './tabs/GrammarianTab';
import { AwardsChecklistsTab } from './tabs/AwardsChecklistsTab';

type TabKey =
  | 'agenda'
  | 'tableTopics'
  | 'guestList'
  | 'attendance'
  | 'resources'
  | 'timerReport'
  | 'ahCounter'
  | 'grammarian'
  | 'awards';

const TABS: { key: TabKey; label: string; shortLabel: string }[] = [
  { key: 'agenda', label: 'Meeting Agenda', shortLabel: 'Agenda' },
  { key: 'tableTopics', label: 'Table Topics', shortLabel: 'Topics' },
  { key: 'guestList', label: 'Guest List', shortLabel: 'Guests' },
  { key: 'attendance', label: 'Attendance', shortLabel: 'Attendance' },
  { key: 'resources', label: 'Resources', shortLabel: 'Resources' },
  { key: 'timerReport', label: 'Timer Report', shortLabel: 'Timer' },
  { key: 'ahCounter', label: 'Ah Counter', shortLabel: 'Ah-Counter' },
  { key: 'grammarian', label: 'Grammarian', shortLabel: 'Grammar' },
  { key: 'awards', label: 'Awards & Checklists', shortLabel: 'Awards' },
];

export type MeetingWorkspaceProps = {
  clubUnitId: string;
  meeting: Meeting;
  members: ClubMemberSummary[];
  roleAssignments: MeetingRoleAssignment[];
  speechSlots: SpeechSlot[];
  pathways: PathwayPath[];
  guests: MeetingGuest[];
  /** The club's guest pipeline — distinct from this meeting's guest list above. */
  clubGuests: Guest[];
  attendance: MeetingAttendanceRosterEntry[];
  resources: MeetingResource[];
  liveRecords: MeetingLiveRecord[];
  checklistTemplates: ChecklistTemplate[];
  checklistRuns: ChecklistRun[];
  ballots: Ballot[];
};

function heading(meeting: Meeting, theme: string, meetingNumber: string): string {
  if (meetingNumber) return `Meeting #${meetingNumber}${theme ? ` — ${theme}` : ''}`;
  if (theme) return theme;
  if (meeting.title) return meeting.title;
  return new Date(meeting.scheduledAt).toLocaleDateString();
}

export function MeetingWorkspace(props: MeetingWorkspaceProps) {
  const { clubUnitId, meeting, members } = props;
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('agenda');
  const { draft, update, save, saveState } = useMeetingDraft(clubUnitId, meeting);
  const [inviteCopied, setInviteCopied] = useState(false);

  const printUrl = `/api/clubs/${clubUnitId}/meetings/${meeting.id}/agenda-print`;

  async function copyInviteLink() {
    const link = `${window.location.origin}/clubs/${clubUnitId}/public`;
    try {
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      window.prompt('Copy this invite link:', link);
    }
  }

  return (
    <MembersProvider members={members}>
      <div className="flex min-h-screen flex-col">
        {/* Sticky header — back, title, save state, actions */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Back to meetings"
              onClick={() => router.push(`/clubs/${clubUnitId}/meetings`)}
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {heading(meeting, draft.theme, draft.meetingNumber)}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {meeting.status.replace('_', ' ')}
                </Badge>
                {saveState === 'saving' && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
                  </span>
                )}
                {saveState === 'saved' && (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-500">
                    <CheckCircle2 className="size-3" aria-hidden /> Saved
                  </span>
                )}
                {saveState === 'error' && (
                  <span className="flex items-center gap-1 text-destructive">
                    <TriangleAlert className="size-3" aria-hidden /> Save failed
                  </span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyInviteLink}
                className="hidden sm:inline-flex"
              >
                <UserPlus className="size-3.5" aria-hidden />
                {inviteCopied ? 'Copied' : 'Invite'}
              </Button>
              <SaveAsTemplateButton
                clubUnitId={clubUnitId}
                meetingId={meeting.id}
                defaultName={draft.theme || draft.title || 'Standard Meeting'}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(printUrl, '_blank', 'noopener')}
                className="hidden sm:inline-flex"
              >
                <Printer className="size-3.5" aria-hidden />
                Print
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void save()}
                disabled={saveState === 'saving'}
              >
                {saveState === 'saving' ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-3.5" aria-hidden />
                )}
                Save
              </Button>
            </div>
          </div>

          {/* Tab bar — horizontally scrollable on a phone, with a fade hinting at overflow */}
          <div className="relative">
            <div
              role="tablist"
              aria-label="Meeting sections"
              className="mx-auto flex w-full max-w-5xl gap-0 overflow-x-auto px-3 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden"
            >
              {TABS.map((t) => {
                const isActive = t.key === tab;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-4 sm:py-3',
                      isActive
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className="sm:hidden">{t.shortLabel}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                  </button>
                );
              })}
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent sm:hidden"
            />
          </div>
        </header>

        {/* Tab content */}
        <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 pb-24 sm:px-4 sm:py-6">
          {tab === 'agenda' && (
            <AgendaTab
              clubUnitId={clubUnitId}
              meeting={meeting}
              draft={draft}
              update={update}
              roleAssignments={props.roleAssignments}
              speechSlots={props.speechSlots}
              pathways={props.pathways}
            />
          )}
          {tab === 'tableTopics' && <TableTopicsTab draft={draft} update={update} />}
          {tab === 'guestList' && (
            <GuestListTab
              clubUnitId={clubUnitId}
              meetingId={meeting.id}
              guests={props.guests}
              clubGuests={props.clubGuests}
            />
          )}
          {tab === 'attendance' && (
            <AttendanceTab
              clubUnitId={clubUnitId}
              meetingId={meeting.id}
              roster={props.attendance}
            />
          )}
          {tab === 'resources' && (
            <ResourcesTab
              clubUnitId={clubUnitId}
              meetingId={meeting.id}
              resources={props.resources}
            />
          )}
          {tab === 'timerReport' && (
            <TimerReportTab
              clubUnitId={clubUnitId}
              meetingId={meeting.id}
              roleAssignments={props.roleAssignments}
              speechSlots={props.speechSlots}
              liveRecords={props.liveRecords}
            />
          )}
          {tab === 'ahCounter' && (
            <AhCounterTab
              clubUnitId={clubUnitId}
              meetingId={meeting.id}
              roleAssignments={props.roleAssignments}
              liveRecords={props.liveRecords}
            />
          )}
          {tab === 'grammarian' && (
            <GrammarianTab
              clubUnitId={clubUnitId}
              meetingId={meeting.id}
              wordOfDay={draft.wordOfDay}
              liveRecords={props.liveRecords}
            />
          )}
          {tab === 'awards' && (
            <AwardsChecklistsTab
              clubUnitId={clubUnitId}
              meetingId={meeting.id}
              checklistTemplates={props.checklistTemplates}
              checklistRuns={props.checklistRuns}
              ballots={props.ballots}
            />
          )}
        </main>

        {/* Lifecycle bar — pinned to the bottom so publish/start/close is always one tap away */}
        <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
            <p className="text-xs text-muted-foreground">
              {new Date(meeting.scheduledAt).toLocaleString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {draft.venue && ` · ${draft.venue}`}
            </p>
            <MeetingStatusActions
              clubUnitId={clubUnitId}
              meetingId={meeting.id}
              status={meeting.status}
            />
          </div>
        </div>
      </div>
    </MembersProvider>
  );
}
