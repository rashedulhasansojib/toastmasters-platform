import { verifyCapabilityToken } from '@/lib/meetings';
import { GuestRegistrationForm } from '@/components/guest/GuestRegistrationForm';

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

  /** M4 Slice 10: the one purpose with a real guest-facing surface so far — every other purpose still falls through to the placeholder below. */
  if (verification.purpose === 'guest_register') {
    return (
      <main className="page flex flex-col gap-3">
        <h1>Interested in joining?</h1>
        <p className="text-sm text-muted-foreground">
          Leave your details and a club officer will reach out.
        </p>
        <GuestRegistrationForm token={token} />
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
