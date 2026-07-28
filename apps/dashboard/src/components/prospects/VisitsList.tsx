import type { ProspectVisit } from '@toastmasters/contracts';

export function VisitsList({ visits }: { visits: ProspectVisit[] }) {
  if (visits.length === 0) {
    return <p className="text-sm text-muted-foreground">No visits logged yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {visits.map((v) => (
        <li key={v.id}>
          {new Date(v.attendedAt).toLocaleDateString()} — meeting {v.meetingId}
        </li>
      ))}
    </ul>
  );
}
