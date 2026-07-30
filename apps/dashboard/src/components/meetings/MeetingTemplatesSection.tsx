'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, FileText, Trash2, Users } from 'lucide-react';
import type { MeetingTemplate } from '@toastmasters/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { submitAction } from '@/lib/toast';

/**
 * The legacy portal's Templates section on the events screen. A template is
 * created by saving an existing meeting from the meeting page, so there is
 * no "new blank template" button here — only reuse and removal.
 */
export function MeetingTemplatesSection({
  clubUnitId,
  templates,
}: {
  clubUnitId: string;
  templates: MeetingTemplate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function remove(id: string) {
    startTransition(async () => {
      const result = await submitAction(
        () =>
          fetch(`/api/clubs/${clubUnitId}/meeting-templates/${id}`, {
            method: 'DELETE',
          }),
        {
          loading: 'Deleting template…',
          success: 'Template deleted',
          error: 'Could not delete that template.',
        },
      );
      if (!result) return;
      setConfirmingId(null);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <FileText className="size-4" aria-hidden />
          Meeting templates
          <span className="ml-1 text-muted-foreground/60 normal-case">({templates.length})</span>
        </h2>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No templates yet. Open a meeting and choose <strong>Template</strong> in its header to
          save its roles, theme and table topics for reuse.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="h-full">
              <CardContent className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{template.name}</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete template ${template.name}`}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={isPending}
                    onClick={() =>
                      confirmingId === template.id
                        ? remove(template.id)
                        : setConfirmingId(template.id)
                    }
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>

                {confirmingId === template.id && (
                  <p className="text-xs text-destructive">
                    Tap the bin again to delete this template.
                  </p>
                )}

                {template.theme && (
                  <p className="truncate text-xs text-muted-foreground">{template.theme}</p>
                )}

                <div className="mt-auto flex flex-col gap-1 pt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users className="size-3.5 shrink-0" aria-hidden />
                    {template.roles.length} role{template.roles.length === 1 ? '' : 's'}
                    {template.tableTopicQuestions?.length
                      ? ` · ${template.tableTopicQuestions.length} table topic${
                          template.tableTopicQuestions.length === 1 ? '' : 's'
                        }`
                      : ''}
                  </span>
                  {template.startTime && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5 shrink-0" aria-hidden />
                      Starts {template.startTime}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
