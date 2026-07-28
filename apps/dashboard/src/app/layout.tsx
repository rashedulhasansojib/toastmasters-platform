import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession, getSwitchableUnits } from '@/lib/session';
import { UnitSwitcher } from '@/components/UnitSwitcher';
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
        <header className="shell-header">
          <Link href="/">Toastmasters Platform</Link>
          {session ? (
            <div className="shell-header-session">
              {session.activeUnitId && (
                <>
                  <Link href={`/clubs/${session.activeUnitId}/meetings`}>Meetings</Link>
                  <Link href={`/clubs/${session.activeUnitId}/prospects`}>Prospects</Link>
                  <Link href={`/clubs/${session.activeUnitId}/finance`}>Finance</Link>
                </>
              )}
              <span>{session.fullName}</span>
              <UnitSwitcher units={units} activeUnitId={session.activeUnitId} />
            </div>
          ) : (
            <Link href="/login">Log in</Link>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
