'use client';

// @fit/admin — authenticated console shell.
//
// The chrome wrapping every signed-in page: a persistent sidebar on `md`+, a top
// bar, and the page content. On small screens the sidebar collapses into a drawer
// toggled from the top bar. Owns only the drawer open/closed state; everything
// role-aware lives in `Sidebar`. The `gymSlug` is resolved server-side in the
// layout and threaded through to the top bar.

import { useState, type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

export function AdminShell({ gymSlug, children }: { gymSlug: string | null; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = (): void => setNavOpen(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar — always visible from md up. */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-100 bg-white md:block">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile drawer — overlay + sliding panel. */}
      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeNav}
            className="absolute inset-0 bg-slate-900/40"
          />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-slate-100 bg-white shadow-xl">
            <Sidebar onNavigate={closeNav} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar gymSlug={gymSlug} onOpenNav={() => setNavOpen(true)} />
        <main className="flex-1 p-gutter">{children}</main>
      </div>
    </div>
  );
}
