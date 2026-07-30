'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChecklistTemplate } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { submitAction } from '@/lib/toast';

export function StartChecklistRunButton({
  clubUnitId,
  meetingId,
  templates,
}: {
  clubUnitId: string;
  meetingId: string;
  templates: ChecklistTemplate[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (templates.length === 0) return null;

  async function onStart() {
    if (!templateId) return;
    setStarting(true);
    try {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/meetings/${meetingId}/checklist-runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateId }),
          }),
        {
          loading: 'Starting checklist…',
          success: 'Checklist started',
          error: 'Could not start that checklist.',
        },
      );
      if (!result) return;
      router.refresh();
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex items-end gap-2">
      <Select value={templateId ?? undefined} onValueChange={(value) => setTemplateId(value)}>
        <SelectTrigger>
          <SelectValue placeholder="Start a checklist…" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" disabled={!templateId || starting} onClick={onStart}>
        {starting ? 'Starting…' : 'Start'}
      </Button>
    </div>
  );
}
