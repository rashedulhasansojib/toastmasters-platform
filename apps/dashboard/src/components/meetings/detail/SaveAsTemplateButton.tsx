'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { submitAction } from '@/lib/toast';

/**
 * "Save as reusable template" — the legacy portal's `isTemplate` checkbox,
 * as an explicit action. Snapshots the meeting's metadata, agenda items and
 * member role assignments into a `MeetingTemplate` the club can build
 * future meetings from.
 */
export function SaveAsTemplateButton({
  clubUnitId,
  meetingId,
  defaultName,
}: {
  clubUnitId: string;
  meetingId: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/meeting-templates/from-meeting`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meetingId, name: name.trim() }),
          }),
        {
          loading: 'Saving template…',
          success: 'Template saved',
          error: 'Could not save this meeting as a template.',
        },
      );
      if (!result) return;
      setSaved(true);
      setOpen(false);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setName(defaultName);
          setOpen(true);
        }}
        className="hidden sm:inline-flex"
      >
        <BookmarkPlus className="size-3.5" aria-hidden />
        {saved ? 'Saved' : 'Template'}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-template-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-background p-5 shadow-xl">
            <div>
              <h2 id="save-template-title" className="text-sm font-semibold">
                Save as template
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Copies this meeting&apos;s theme, venue, roles, word of the day and table topics
                into a reusable template. Speakers aren&apos;t copied — they change every week.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="template-name" className="text-xs text-muted-foreground">
                Template name
              </Label>
              <Input
                id="template-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                  if (e.key === 'Escape') setOpen(false);
                }}
                placeholder="Standard Meeting"
                maxLength={100}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={submit} disabled={saving || !name.trim()}>
                {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                Save template
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
