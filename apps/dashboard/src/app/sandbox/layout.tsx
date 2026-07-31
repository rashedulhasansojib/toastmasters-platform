import type { ReactNode } from 'react';

export default function SandboxLayout({ children }: { children: ReactNode }) {
  return (
    <div className="page flex flex-col gap-6">
      <div className="rounded-xl border border-[#EBD9C8] bg-[#FAF3EC] px-4 py-3 text-sm text-[#772432]">
        You&apos;re exploring a sandbox demo club. Everything here — members, meetings, guests,
        planner entries, education progress — is sample data. Anything you add or change only exists
        for this session and is never saved to a real club.
      </div>
      {children}
    </div>
  );
}
