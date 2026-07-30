'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import type { CreateMeetingRequest, Meeting, MeetingTemplate } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { submitAction, toast } from '@/lib/toast';

type Mode = 'blank' | 'template';

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The legacy portal's "New Event" dialog: start blank, or build from a
 * template that brings its roles, agenda, word of the day and table topics
 * with it. Either way the user lands on the meeting page ready to edit —
 * the old flow's "Create & Build".
 */
export function NewMeetingDialog({
  clubUnitId,
  programYearId,
  templates,
}: {
  clubUnitId: string;
  programYearId: string | null;
  templates: MeetingTemplate[];
}) {
  const router = useRouter();
  // The sidebar's "Create meeting" quick action deep-links here with ?new=1,
  // so there is one creation path rather than a second standalone form.
  // Derived rather than synced into state by an effect: the dialog is open
  // if the user opened it, or the URL asked for it and they haven't closed it.
  const searchParams = useSearchParams();
  const wantsNew = searchParams.get('new') === '1';
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = manuallyOpen || (wantsNew && !dismissed);

  function setOpen(next: boolean) {
    setManuallyOpen(next);
    if (!next) setDismissed(true);
  }
  const [mode, setMode] = useState<Mode>('blank');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState('18:00');
  const [meetingNumber, setMeetingNumber] = useState('');
  const [theme, setTheme] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  function openDialog() {
    setMode('blank');
    setTemplateId(null);
    setDate(todayISO());
    setStartTime('18:00');
    setMeetingNumber('');
    setTheme('');
    setDismissed(false);
    setManuallyOpen(true);
  }

  /** Picking a template pre-fills the dialog with its defaults, still editable. */
  function pickTemplate(template: MeetingTemplate) {
    setTemplateId(template.id);
    if (template.startTime) setStartTime(template.startTime);
    if (template.theme) setTheme(template.theme);
  }

  async function create() {
    if (!programYearId) {
      toast.error('No active program year for this club — set one before creating a meeting.');
      return;
    }
    if (!date || !startTime) {
      toast.error('Pick a date and a start time.');
      return;
    }
    if (mode === 'template' && !selectedTemplate) {
      toast.error('Choose a template, or start blank.');
      return;
    }

    setCreating(true);
    try {
      const scheduledAt = new Date(`${date}T${startTime}:00`).toISOString();
      const number =
        meetingNumber.trim() && Number(meetingNumber) > 0 ? Number(meetingNumber) : undefined;

      const result = await submitAction(
        () =>
          mode === 'template' && selectedTemplate
            ? fetch(`/api/clubs/${clubUnitId}/meeting-templates/create-meeting`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  templateId: selectedTemplate.id,
                  programYearId,
                  scheduledAt,
                  ...(number ? { meetingNumber: number } : {}),
                  ...(theme.trim() ? { theme: theme.trim() } : {}),
                }),
              })
            : fetch(`/api/clubs/${clubUnitId}/meetings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  programYearId,
                  scheduledAt,
                  ...(number ? { meetingNumber: number } : {}),
                  ...(theme.trim() ? { theme: theme.trim() } : {}),
                } satisfies CreateMeetingRequest),
              }),
        {
          loading: 'Creating meeting…',
          success: 'Meeting created',
          error: 'Could not create the meeting.',
        },
      );
      if (!result) return;
      const meeting: Meeting = await result.json();
      setOpen(false);
      router.push(`/clubs/${clubUnitId}/meetings/${meeting.id}`);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={openDialog}>
        <Plus className="size-4" aria-hidden />
        New meeting
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-meeting-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl border border-border bg-background p-5 shadow-xl sm:rounded-xl">
            <h2 id="new-meeting-title" className="text-base font-semibold">
              New meeting
            </h2>

            {/* Mode */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('blank');
                  setTemplateId(null);
                }}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                  mode === 'blank'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted',
                )}
              >
                Start blank
              </button>
              <button
                type="button"
                onClick={() => setMode('template')}
                disabled={templates.length === 0}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-40',
                  mode === 'template'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted',
                )}
              >
                Use a template
              </button>
            </div>

            {mode === 'template' && templates.length > 0 && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Select template</Label>
                <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border p-2">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => pickTemplate(template)}
                      className={cn(
                        'rounded-md px-3 py-2 text-left text-sm transition-colors',
                        templateId === template.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted',
                      )}
                    >
                      <span className="block font-medium">{template.name}</span>
                      <span
                        className={cn(
                          'block text-xs',
                          templateId === template.id
                            ? 'text-primary-foreground/80'
                            : 'text-muted-foreground',
                        )}
                      >
                        {template.roles.length} role
                        {template.roles.length === 1 ? '' : 's'}
                        {template.tableTopicQuestions?.length
                          ? ` · ${template.tableTopicQuestions.length} table topic${
                              template.tableTopicQuestions.length === 1 ? '' : 's'
                            }`
                          : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="nm-date" className="text-xs text-muted-foreground">
                  Date
                </Label>
                <Input
                  id="nm-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="nm-time" className="text-xs text-muted-foreground">
                  Start time
                </Label>
                <Input
                  id="nm-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="nm-number" className="text-xs text-muted-foreground">
                  Meeting #
                </Label>
                <Input
                  id="nm-number"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={meetingNumber}
                  onChange={(e) => setMeetingNumber(e.target.value)}
                  placeholder="40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="nm-theme" className="text-xs text-muted-foreground">
                  Theme (optional)
                </Label>
                <Input
                  id="nm-theme"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Expectations vs Reality"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={create}
                disabled={creating || (mode === 'template' && !selectedTemplate)}
              >
                {creating && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Create &amp; build
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
