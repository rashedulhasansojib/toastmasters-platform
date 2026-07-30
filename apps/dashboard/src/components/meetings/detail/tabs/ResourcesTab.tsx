'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import type { MeetingResource } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { submitAction, toast } from '@/lib/toast';
import { EmptyState, Field } from '../primitives';

/**
 * Free-form notes and links for one meeting — the legacy Resources tab.
 *
 * Each card edits its own row and PATCHes on a debounce, so typing in one
 * resource never re-renders or re-saves the others.
 */
export function ResourcesTab({
  clubUnitId,
  meetingId,
  resources,
}: {
  clubUnitId: string;
  meetingId: string;
  resources: MeetingResource[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const base = `/api/clubs/${clubUnitId}/meetings/${meetingId}/resources`;

  function add() {
    startTransition(async () => {
      const result = await submitAction(
        () =>
          fetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Untitled resource' }),
          }),
        {
          loading: 'Adding resource…',
          success: 'Resource added',
          error: 'Could not add a resource.',
        },
      );
      if (!result) return;
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await submitAction(() => fetch(`${base}/${id}`, { method: 'DELETE' }), {
        loading: 'Deleting resource…',
        success: 'Resource deleted',
        error: 'Could not delete that resource.',
      });
      if (!result) return;
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Resources</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Links, notes, or references for this meeting.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={isPending}>
          <Plus className="size-3.5" aria-hidden />
          Add
        </Button>
      </div>

      {resources.length === 0 ? (
        <EmptyState
          title="No resources yet"
          hint="Add a recording link, a slide deck URL, or notes to share with attendees."
          action={
            <Button type="button" variant="outline" size="sm" onClick={add} disabled={isPending}>
              <Plus className="size-4" aria-hidden />
              Add a resource
            </Button>
          }
        />
      ) : (
        <>
          {resources.map((resource, index) => (
            <ResourceCard
              key={resource.id}
              base={base}
              resource={resource}
              index={index}
              onDelete={() => remove(resource.id)}
              disabled={isPending}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={add}
            disabled={isPending}
          >
            <Plus className="size-4" aria-hidden />
            Add another resource
          </Button>
        </>
      )}
    </div>
  );
}

const SAVE_DELAY_MS = 1200;

function ResourceCard({
  base,
  resource,
  index,
  onDelete,
  disabled,
}: {
  base: string;
  resource: MeetingResource;
  index: number;
  onDelete: () => void;
  disabled: boolean;
}) {
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  // Bumped on every keystroke; the effect below debounces off it, so the
  // save always sees the current values without a render-time ref write.
  const [dirtyAt, setDirtyAt] = useState(0);

  function markDirty() {
    setDirtyAt(Date.now());
  }

  useEffect(() => {
    if (dirtyAt === 0) return;
    const timer = setTimeout(async () => {
      setState('saving');
      try {
        const res = await fetch(`${base}/${resource.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim() || 'Untitled resource',
            description: description.trim() || null,
          }),
        });
        if (res.ok) {
          setState('saved');
        } else {
          setState('idle');
          toast.error('Could not save that resource.');
        }
      } catch {
        setState('idle');
        toast.error('Could not save that resource.');
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirtyAt, base, resource.id, title, description]);

  // Clear the transient "Saved" badge without re-triggering a save.
  useEffect(() => {
    if (state !== 'saved') return;
    const timer = setTimeout(() => setState('idle'), 1500);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="pt-0.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Resource {index + 1}
        </span>
        <div className="flex items-center gap-2">
          {state === 'saving' && <span className="text-xs text-muted-foreground">Saving…</span>}
          {state === 'saved' && (
            <span className="text-xs text-green-600 dark:text-green-500">Saved</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete resource ${index + 1}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            disabled={disabled}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <Field label="Title" htmlFor={`res-title-${resource.id}`}>
        <Input
          id={`res-title-${resource.id}`}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            markDirty();
          }}
          placeholder="Meeting recording, slide deck, useful article…"
        />
      </Field>

      <Field label="Description" htmlFor={`res-desc-${resource.id}`}>
        <Textarea
          id={`res-desc-${resource.id}`}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            markDirty();
          }}
          rows={4}
          placeholder="Add a URL, notes, instructions, or any details about this resource…"
          className="resize-none"
        />
      </Field>
    </div>
  );
}
