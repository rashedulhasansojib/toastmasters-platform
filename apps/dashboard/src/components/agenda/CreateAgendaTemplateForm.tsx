'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type DraftItem = { title: string; minutes: string; roleKey: string };

function blankItem(): DraftItem {
  return { title: '', minutes: '5', roleKey: '' };
}

export function CreateAgendaTemplateForm({ clubUnitId }: { clubUnitId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clubs/${clubUnitId}/agenda-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          items: items.map((item) => ({
            title: item.title,
            plannedDurationSeconds: Math.max(1, Number(item.minutes)) * 60,
            roleKey: item.roleKey || null,
          })),
        }),
      });
      if (!res.ok) {
        setError('Could not save that template.');
        return;
      }
      setName('');
      setItems([blankItem()]);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="template-name">Template name</Label>
        <Input
          id="template-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Standard club meeting"
          className="max-w-sm"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`template-item-title-${i}`}>Item {i + 1}</Label>
              <Input
                id={`template-item-title-${i}`}
                value={item.title}
                onChange={(e) => updateItem(i, { title: e.target.value })}
                placeholder="Table Topics"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`template-item-minutes-${i}`}>Minutes</Label>
              <Input
                id={`template-item-minutes-${i}`}
                type="number"
                min={1}
                value={item.minutes}
                onChange={(e) => updateItem(i, { minutes: e.target.value })}
                className="w-20"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`template-item-role-${i}`}>Role (optional)</Label>
              <Input
                id={`template-item-role-${i}`}
                value={item.roleKey}
                onChange={(e) => updateItem(i, { roleKey: e.target.value })}
                placeholder="toastmaster"
                className="w-40"
              />
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
          {submitting ? 'Saving…' : 'Save template'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
