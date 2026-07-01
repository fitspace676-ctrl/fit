'use client';

// @fit/admin — authenticated console shell (formacore).
//
// The chrome wrapping every signed-in page: a persistent dark sidebar on `md`+, a
// top bar, and the page content. On small screens the sidebar collapses into a
// drawer toggled from the top bar. Owns only the drawer open/closed state.

import { useState, type ReactNode } from 'react';
import { AuroraBackground, ToastProvider } from '@/components/ui';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/**
 * Live system signal for the sidebar chrome, resolved server-side in the console
 * layout from a real `GET /admin/check-ins/stats` call: `online` is whether the
 * Fit API answered at all, `checkInCount` today's arrivals (the Check-in nav
 * badge), or `null` when unreachable / unauthorised.
 */
export interface ShellSystemState {
  online: boolean;
  checkInCount: number | null;
}

export function AdminShell({
  gymSlug,
  system,
  children,
}: {
  gymSlug: string | null;
  system: ShellSystemState;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = (): void => setNavOpen(false);

  return (
    <ToastProvider>
      <AuroraBackground />
      <div className="relative flex min-h-screen">
        {/* Desktop sidebar — dark, always visible from md up. */}
        <aside className="hidden w-60 shrink-0 bg-ink-950 md:block">
          <div className="sticky top-0 h-screen overflow-y-auto">
            <Sidebar gymSlug={gymSlug} system={system} />
          </div>
        </aside>

        {/* Mobile drawer — overlay + sliding panel. */}
        {navOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={closeNav}
              className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
            />
            <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-ink-950 shadow-2xl">
              <Sidebar gymSlug={gymSlug} system={system} onNavigate={closeNav} />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar gymSlug={gymSlug} onOpenNav={() => setNavOpen(true)} />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
