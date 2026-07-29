'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { PathwayPath, SpeechSlot } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MemberCombobox } from '../MemberCombobox';
import { EmptyState, Field } from '../primitives';

const MAX_SPEAKERS = 3;

/**
 * The legacy portal's "Prepared Speakers" block, editable in place.
 *
 * One difference from the legacy free-text fields: Path, Project and Level
 * resolve against the seeded Pathways catalogue rather than being typed. The
 * level is derived from the chosen project server-side, and the duration is
 * validated against that project's bounds — so a speech can't be filed
 * against a project that doesn't exist or run outside its permitted length.
 */
export function PreparedSpeakers({
  base,
  slots,
  pathways,
}: {
  base: string;
  slots: SpeechSlot[];
  pathways: PathwayPath[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function remove(slotId: string) {
    setError(null);
    const res = await fetch(`${base}/speech-slots/${slotId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      setError('Could not remove that speaker.');
      return;
    }
    refresh();
  }

  /** Reorder is a straight position swap — the API stores `position` per slot. */
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= slots.length) return;
    setError(null);
    const a = slots[index];
    const b = slots[target];
    const results = await Promise.all([
      fetch(`${base}/speech-slots/${a.id}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: b.position }),
      }),
      fetch(`${base}/speech-slots/${b.id}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: a.position }),
      }),
    ]);
    if (results.some((r) => !r.ok)) {
      setError('Could not reorder the speakers.');
      return;
    }
    refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {slots.length === 0 && !adding && (
        <EmptyState
          title="No prepared speakers yet"
          hint={`Add up to ${MAX_SPEAKERS} speakers with their evaluator, path and project.`}
        />
      )}

      {slots.map((slot, index) => (
        <SpeakerCard
          key={slot.id}
          base={base}
          slot={slot}
          index={index}
          total={slots.length}
          pathways={pathways}
          disabled={isPending}
          onDelete={() => remove(slot.id)}
          onMove={(dir) => move(index, dir)}
          onSaved={refresh}
        />
      ))}

      {adding && (
        <SpeakerCard
          base={base}
          slot={null}
          index={slots.length}
          total={slots.length}
          pathways={pathways}
          disabled={isPending}
          onDelete={() => setAdding(false)}
          onMove={() => {}}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}

      {!adding && slots.length < MAX_SPEAKERS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setAdding(true)}
          disabled={isPending || pathways.length === 0}
        >
          <Plus className="size-4" aria-hidden />
          Add speaker {slots.length > 0 ? `(${slots.length}/${MAX_SPEAKERS})` : ''}
        </Button>
      )}

      {pathways.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No Pathways paths are seeded yet, so a speech can&apos;t be filed against a project.
        </p>
      )}
    </div>
  );
}

/**
 * One speaker. `slot === null` is the add form — the same fields, saved with
 * POST instead of PATCH, so there is one layout to maintain rather than two.
 */
function SpeakerCard({
  base,
  slot,
  index,
  total,
  pathways,
  disabled,
  onDelete,
  onMove,
  onSaved,
}: {
  base: string;
  slot: SpeechSlot | null;
  index: number;
  total: number;
  pathways: PathwayPath[];
  disabled: boolean;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onSaved: () => void;
}) {
  const isNew = slot === null;

  const [speakerPersonId, setSpeakerPersonId] = useState<string | null>(
    slot?.speakerPersonId ?? slot?.requestedBy ?? null,
  );
  const [evaluatorPersonId, setEvaluatorPersonId] = useState<string | null>(
    slot?.evaluatorPersonId ?? null,
  );
  const [title, setTitle] = useState(slot?.title ?? '');
  const [pathCode, setPathCode] = useState(slot?.pathCode ?? pathways[0]?.pathCode ?? '');
  const [projectCode, setProjectCode] = useState(slot?.projectCode ?? '');
  const [minutes, setMinutes] = useState(
    slot ? String(Math.round(slot.plannedDurationSeconds / 60)) : '',
  );
  const [notes, setNotes] = useState(slot?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const path = pathways.find((p) => p.pathCode === pathCode) ?? null;
  const project = path?.projects.find((p) => p.projectCode === projectCode) ?? null;

  /** Picking a project seeds the duration from its permitted range. */
  function pickProject(code: string) {
    setProjectCode(code);
    const next = path?.projects.find((p) => p.projectCode === code);
    if (next && !minutes) setMinutes(String(next.maxMinutes));
  }

  function pickPath(code: string) {
    setPathCode(code);
    setProjectCode('');
    setMinutes('');
  }

  async function save() {
    if (!title.trim() || !pathCode || !projectCode || !minutes) {
      setError('Title, path, project and duration are all required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        pathCode,
        projectCode,
        plannedDurationSeconds: Math.max(1, Number(minutes)) * 60,
        ...(speakerPersonId ? { speakerPersonId } : {}),
        ...(evaluatorPersonId ? { evaluatorPersonId } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };

      const res = isNew
        ? await fetch(`${base}/speech-slots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`${base}/speech-slots/${slot.id}/details`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...body,
              speakerPersonId: speakerPersonId,
              evaluatorPersonId: evaluatorPersonId,
              notes: notes.trim() || null,
            }),
          });

      if (!res.ok) {
        // The API rejects a duration outside the project's bounds with a
        // specific message — surface it rather than a generic failure.
        const detail = await res.json().catch(() => null);
        setError(detail?.detail ?? detail?.message ?? 'Could not save this speaker.');
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        {!isNew && (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index === 0 || disabled}
              aria-label="Move speaker up"
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronUp className="size-3" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={index === total - 1 || disabled}
              aria-label="Move speaker down"
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronDown className="size-3" aria-hidden />
            </button>
          </div>
        )}
        <span className="w-5 shrink-0 text-sm font-semibold text-muted-foreground">
          #{index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {isNew ? 'New speaker' : title || 'Speaker'}
        </span>
        {slot && (
          <Badge
            variant={slot.status === 'approved' ? 'secondary' : 'outline'}
            className="text-[10px]"
          >
            {slot.status}
          </Badge>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={isNew ? 'Cancel' : 'Remove speaker'}
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={disabled || saving}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Speaker" className="col-span-2">
          <MemberCombobox
            value={speakerPersonId}
            onChange={setSpeakerPersonId}
            placeholder="Select speaker…"
          />
        </Field>
        <Field label="Duration (min)">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder={project ? String(project.maxMinutes) : '7'}
          />
        </Field>

        <Field label="Speech Title" className="col-span-2 sm:col-span-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Three Things That Shaped Me"
          />
        </Field>

        <Field label="Evaluator" className="col-span-2 sm:col-span-1">
          <MemberCombobox
            value={evaluatorPersonId}
            onChange={setEvaluatorPersonId}
            placeholder="Select evaluator…"
          />
        </Field>

        <Field label="Path">
          <select
            value={pathCode}
            onChange={(e) => pickPath(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">— Choose —</option>
            {pathways.map((p) => (
              <option key={p.pathCode} value={p.pathCode}>
                {p.name} ({p.pathCode})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Project">
          <select
            value={projectCode}
            onChange={(e) => pickProject(e.target.value)}
            disabled={!path}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="">— Choose —</option>
            {(path?.projects ?? []).map((p) => (
              <option key={p.projectCode} value={p.projectCode}>
                L{p.level} · {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Level" className="sm:col-span-1">
          <Input
            readOnly
            value={project ? `Level ${project.level}` : slot ? `Level ${slot.level}` : '—'}
            className="bg-muted/50 text-muted-foreground"
            aria-describedby={`level-hint-${slot?.id ?? 'new'}`}
          />
        </Field>

        <Field label="Notes (optional)" className="col-span-2">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Using presentation software"
          />
        </Field>
      </div>

      <p id={`level-hint-${slot?.id ?? 'new'}`} className="text-xs text-muted-foreground">
        {project
          ? `Level and duration bounds (${project.minMinutes}–${project.maxMinutes} min) come from the Pathways project.`
          : 'Level is set by the Pathways project you choose.'}
      </p>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={saving || disabled}>
          {saving ? 'Saving…' : isNew ? 'Add speaker' : 'Save speaker'}
        </Button>
      </div>
    </div>
  );
}
