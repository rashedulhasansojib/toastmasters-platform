'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

/**
 * The public sandbox-signup link (platform dashboard widget). A fixed,
 * unauthenticated route — anyone who scans the QR or visits the link can
 * sign up and land in the read/write sandbox at apps/dashboard/src/app/
 * sandbox, backed by apps/api's in-memory-only sandbox module. Not a
 * per-invite token: there is nothing sensitive behind it to revoke.
 */
export function SandboxSignupCard({ demoSignupCount }: { demoSignupCount: number }) {
  const signupUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/signup`;

  async function copyLink() {
    await navigator.clipboard.writeText(signupUrl);
    toast.success('Signup link copied');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Try Toastie (sandbox demo)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Share this link or QR code so anyone can explore a sample club — no club, no invitation,
          nothing they do is saved.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-6">
        <div className="rounded-xl border border-border bg-white p-3">
          <QRCodeSVG value={signupUrl} size={128} />
        </div>
        <div className="flex flex-col gap-2">
          <code className="rounded-md bg-muted px-2 py-1 text-sm">{signupUrl}</code>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={copyLink}>
              <Copy className="size-4" />
              Copy link
            </Button>
            <p className="text-sm text-muted-foreground">
              {demoSignupCount} sandbox signup{demoSignupCount === 1 ? '' : 's'} so far
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
