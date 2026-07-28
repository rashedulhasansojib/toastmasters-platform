'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgendaTemplate } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ApplyAgendaTemplateButton({
  clubUnitId,
  meetingId,
  templates,
}: {
  clubUnitId: string;
  meetingId: string;
  templates: AgendaTemplate[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (templates.length === 0) return null;

  async function onApply() {
    if (!templateId) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clubs/${clubUnitId}/meetings/${meetingId}/agenda-items/from-template`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId }),
        },
      );
      if (!res.ok) {
        setError('Could not apply that template.');
        return;
      }
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex items-end gap-2">
      <Select value={templateId ?? undefined} onValueChange={(value) => setTemplateId(value)}>
        <SelectTrigger>
          <SelectValue placeholder="Apply a template…" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" disabled={!templateId || applying} onClick={onApply}>
        {applying ? 'Applying…' : 'Apply'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
