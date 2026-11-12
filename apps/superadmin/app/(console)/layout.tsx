import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/sign-out-button';
import { OpsLogo } from '@/components/ops/logo';
import { OpsNav } from '@/components/ops/nav';
import { fetchOperator, fetchGymRequests } from '@/lib/api';

/** Up to two initials: from a name's first two words, else an address's first letter. */
function initials(label: string): string {
  const words = label
    .split('@')[0]!
    .split(/[\s._-]+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  // Who is signed in. Best-effort: the shell must still render (and offer Sign
  // out) when this one read fails, so a failure simply leaves the card out.
  const [operator, requests] = await Promise.all([
    fetchOperator().catch(() => null),
    fetchGymRequests().catch(() => null),
  ]);
  const pendingRequests =
    requests?.requests.filter((request) => request.status === 'SUBMITTED').length ?? 0;
  return (
    <div className="ops-shell">
      <aside className="ops-rail">
        <OpsLogo />
        <OpsNav pendingRequests={pendingRequests} />
        <div className="ops-rail-foot">
          {operator ? (
            <div className="ops-user">
              <span className="ops-user-initials" aria-hidden="true">
                {initials(operator.name ?? operator.email)}
              </span>
              <div>
                <strong>{operator.name ?? 'Operator'}</strong>
                <span title={operator.email}>{operator.email}</span>
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
