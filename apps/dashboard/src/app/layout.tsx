import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession, getSwitchableUnits } from '@/lib/session';
import { AppShell } from '@/components/app-shell/AppShell';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Toastmasters Platform',
  description: 'Club and district management for Toastmasters.',
  manifest: '/manifest.webmanifest',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const units = session ? await getSwitchableUnits() : [];

  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {session ? (
          <AppShell session={session} units={units}>
            {children}
          </AppShell>
        ) : (
          <>
            <header className="shell-header">
              <Link href="/">Toastmasters Platform</Link>
              <Link href="/login">Log in</Link>
            </header>
            {children}
          </>
        )}
        <Toaster />
      </body>
    </html>
  );
}
