import type { ProspectCommunication } from '@toastmasters/contracts';

export function CommunicationsList({
  communications,
}: {
  communications: ProspectCommunication[];
}) {
  if (communications.length === 0) {
    return <p className="text-sm text-muted-foreground">No communications logged yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {communications.map((c) => (
        <li key={c.id}>
          <span className="font-medium">{c.channel}</span> —{' '}
          {new Date(c.loggedAt).toLocaleDateString()}: {c.note}
        </li>
      ))}
    </ul>
  );
}
