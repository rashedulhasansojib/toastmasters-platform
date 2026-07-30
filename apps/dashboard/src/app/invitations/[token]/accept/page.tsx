import { invitationPreview } from '@toastmasters/contracts';
import { AcceptInvitationForm } from '@/components/AcceptInvitationForm';
import { callApi } from '@/lib/session-proxy';

/** Public — the invited person has no session yet. Reached via the copyable link the Users admin issues. */
export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Server-to-server via callApi() — the accept flow's preview endpoint is
  // @Public(), so no session cookie is involved.
  const previewResponse = await callApi(`/v1/invitations/${encodeURIComponent(token)}/preview`, {
    method: 'GET',
  });
  const preview = previewResponse.ok
    ? invitationPreview.safeParse(await previewResponse.json())
    : null;
  const invitedEmail = preview?.success ? preview.data.email : null;

  return (
    <main className="flex min-h-[80vh] items-center justify-center bg-linear-to-b from-[#FAF3EC] to-[#F3E7DA] px-6 py-16">
      <div className="w-full max-w-sm rounded-3xl border border-[#EBD9C8] bg-white p-8 shadow-[0_20px_60px_-20px_rgba(119,36,50,0.25)] sm:p-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#772432] text-lg font-bold text-white">
            T
          </div>
          <h1 className="text-2xl font-semibold text-[#2A1418]">Set up your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You&apos;ve been invited to Toastmasters Portal
          </p>
        </div>
        {invitedEmail ? (
          <AcceptInvitationForm token={token} email={invitedEmail} />
        ) : (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            That invitation link is invalid, expired, or already used.
          </p>
        )}
      </div>
    </main>
  );
}
