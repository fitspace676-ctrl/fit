import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/sign-out-button';
import { OpsLogo } from '@/components/ops/logo';
import { OpsNav } from '@/components/ops/nav';
import { getServerSession } from '@/lib/session';

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  return (
    <div className="ops-shell">
      <aside className="ops-rail">
        <OpsLogo />
        <OpsNav />
        <div className="ops-rail-foot">
          {session ? (
            <div className="ops-user">
              <svg
                aria-hidden="true"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M5 21a7 7 0 0 1 14 0" />
              </svg>
              <div>
                <strong>Operator</strong>
                <span title={session.userId}>{session.userId}</span>
              </div>
            </div>
          ) : null}
          <SignOutButton />
        </div>
      </aside>
      <main className="ops-content">
        <div className="ops-content-inner">{children}</div>
      </main>
    </div>
  );
}
