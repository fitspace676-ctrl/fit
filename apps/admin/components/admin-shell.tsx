'use client';

// @fit/admin — authenticated console shell (Astryx, T11.17).
//
// The chrome wrapping every signed-in page, rebuilt on the Astryx `AppShell` over
// the Fit brand tokens: a collapsible side navigation on `md`+, a top bar, and
// the page content. Below the `md` breakpoint AppShell folds the side nav into an
// overlay drawer, toggled from the `<MobileNavToggle>` the top bar renders. All
// nav/top-bar state (collapse, drawer open/close) is owned by AppShell itself.

import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { AppShell } from '@astryxdesign/core/AppShell';
import { SkipLink, ToastProvider } from '@/components/ui';
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

const styles = stylex.create({
  content: {
    display: 'block',
    minHeight: '100%',
  },
  topBar: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    backgroundColor: 'var(--color-background-body)',
  },
  page: {
    padding: '1.5rem',
  },
});

export function AdminShell({
  gymSlug,
  system,
  children,
}: {
  gymSlug: string | null;
  system: ShellSystemState;
  children: ReactNode;
}) {
  const t = useTranslations('admin.common');

  return (
    <ToastProvider>
      <SkipLink>{t('skipToContent')}</SkipLink>
      <AppShell
        variant="wash"
        contentPadding={0}
        sideNav={<Sidebar gymSlug={gymSlug} system={system} />}
        mobileNav={{ hasToggle: false, breakpoint: 'md' }}
      >
        <div id="main-content" {...stylex.props(styles.content)}>
          <div {...stylex.props(styles.topBar)}>
            <TopBar />
          </div>
          <div {...stylex.props(styles.page)}>{children}</div>
        </div>
      </AppShell>
    </ToastProvider>
  );
}
