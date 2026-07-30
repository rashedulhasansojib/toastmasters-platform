'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ChecklistAppliesTo, ChecklistPhase } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { submitAction } from '@/lib/toast';

type DraftItem = { key: string; label: string; ownerRole: string; phase: ChecklistPhase };

function blankItem(): DraftItem {
  return { key: '', label: '', ownerRole: '', phase: 'before' };
}

const APPLIES_TO: ChecklistAppliesTo[] = ['meeting', 'excom', 'contest', 'special_event'];
const PHASES: ChecklistPhase[] = ['before', 'during', 'after'];

export function CreateChecklistTemplateForm({ clubUnitId }: { clubUnitId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [appliesTo, setAppliesTo] = useState<ChecklistAppliesTo>('meeting');
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [submitting, setSubmitting] = useState(false);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/checklist-templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              appliesTo,
              items: items.map((item) => ({
                key: item.key,
                label: item.label,
                ownerRole: item.ownerRole || null,
                phase: item.phase,
              })),
            }),
          }),
        {
          loading: 'Saving checklist…',
          success: 'Checklist saved',
          error: 'Could not save that checklist.',
        },
      );
      if (!result) return;
      setName('');
      setItems([blankItem()]);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="checklist-name">Checklist name</Label>
          <Input
            id="checklist-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Opening checklist"
            className="max-w-sm"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Applies to</Label>
          <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as ChecklistAppliesTo)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPLIES_TO.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`checklist-item-key-${i}`}>Key</Label>
              <Input
                id={`checklist-item-key-${i}`}
                value={item.key}
                onChange={(e) => updateItem(i, { key: e.target.value })}
                placeholder="open_room"
                className="w-32"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`checklist-item-label-${i}`}>Label</Label>
              <Input
                id={`checklist-item-label-${i}`}
                value={item.label}
                onChange={(e) => updateItem(i, { label: e.target.value })}
                placeholder="Open the room"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`checklist-item-owner-${i}`}>Owner role (optional)</Label>
              <Input
                id={`checklist-item-owner-${i}`}
                value={item.ownerRole}
                onChange={(e) => updateItem(i, { ownerRole: e.target.value })}
                placeholder="sergeant_at_arms"
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Phase</Label>
              <Select
                value={item.phase}
                onValueChange={(v) => updateItem(i, { phase: v as ChecklistPhase })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHASES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => setItems((prev) => [...prev, blankItem()])}
        >
          Add item
        </Button>
      </div>

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save checklist'}
        </Button>
      </div>
    </form>
  );
}
