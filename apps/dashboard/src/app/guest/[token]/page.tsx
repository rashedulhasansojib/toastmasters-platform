import { verifyCapabilityToken } from '@/lib/meetings';

export default async function GuestTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verification = await verifyCapabilityToken(token);

  if (!verification.valid) {
    return (
      <main className="page flex flex-col gap-3">
        <h1>This link isn&apos;t active</h1>
        <p className="text-sm text-muted-foreground">
          It may have expired or been revoked by the meeting&apos;s officers.
        </p>
      </main>
    );
  }

  return (
    <main className="page flex flex-col gap-3">
      <h1>You&apos;re running {verification.purpose}</h1>
      <p className="text-sm text-muted-foreground">
        This link is valid for one meeting. Ask the meeting&apos;s officers for the tool itself —
        guest data entry for this role isn&apos;t wired up yet.
      </p>
    </main>
  );
}
