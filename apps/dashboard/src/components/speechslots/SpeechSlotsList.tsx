import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { SpeechSlot } from '@toastmasters/contracts';
import { SpeechSlotActions } from './SpeechSlotActions';

export function SpeechSlotsList({
  clubUnitId,
  meetingId,
  slots,
}: {
  clubUnitId: string;
  meetingId: string;
  slots: SpeechSlot[];
}) {
  if (slots.length === 0) {
    return <p className="text-sm text-muted-foreground">No speech requests yet.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {slots.map((slot, i) => (
          <div key={slot.id}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium">{slot.title}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {slot.pathCode} · {slot.projectCode} · level {slot.level} ·{' '}
                  {Math.round(slot.plannedDurationSeconds / 60)} min — {slot.status}
                </span>
              </div>
              {slot.status === 'requested' && (
                <SpeechSlotActions
                  clubUnitId={clubUnitId}
                  meetingId={meetingId}
                  speechSlotId={slot.id}
                />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
