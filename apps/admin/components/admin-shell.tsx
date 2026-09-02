'use client';

// @fit/admin — authenticated console shell (Astryx, T11.17).
//
// The chrome wrapping every signed-in page, rebuilt on the Astryx `AppShell` over
// the Fit brand tokens: a collapsible side navigation on `md`+, a top bar, and
// the page content. Below the `md` breakpoint AppShell folds the side nav into an
// overlay drawer, toggled from the `<MobileNavToggle>` the top bar renders. All
// nav/top-bar state (collapse, drawer open/close) is owned by AppShell itself.
//
// THE SCROLL MODEL. The shell is pinned to the viewport and only the content
// column moves: AppShell's default `height="fill"` gives its root `100dvh` and
// makes the `<main>` it renders (`#astryx-app-shell-main`) the one scroll
// container, with the side nav panel scrolling separately inside its own rail.
// Nothing here re-implements that. What it took to make it actually hold were
// two things the shell had been leaking through: `styles.content` below, and the
// `banner` prop — see both.

import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { AppShell } from '@astryxdesign/core/AppShell';
import { SkipLink, ToastProvider } from '@/components/ui';
import { AgentChat } from './agent/agent-chat';
import { Sidebar } from './sidebar';
import type { Session } from '@/lib/auth-session';
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

/** A gym location as the top-bar switcher needs it. */
export interface ShellLocation {
  id: string;
  name: string;
}

const styles = stylex.create({
  content: {
    display: 'block',
    minHeight: '100%',
    /*
     * `position: relative` is what keeps the document from scrolling.
     *
     * Astryx's `<main>` is a scroll container but it is NOT positioned, and
     * neither is anything between it and `.astryx-app-shell` — which IS
     * (`position: relative`). So every `position: absolute` descendant of a page
     * resolved its containing block all the way up to the shell root, and an
     * absolutely positioned box whose containing block sits OUTSIDE a scroll
     * container is not clipped by it: it overflows the shell instead, the body
     * grows to fit, and the browser scrolls the whole document — carrying the
     * side nav and the top bar off the top of the screen with it, and leaving an
     * empty band under the rail wherever the page was short.
     *
     * It takes nothing visible to trigger. The offenders on `/members` were a
     * screen-reader-only `<caption>` and the hidden `<input>` behind each row's
     * checkbox — 1px boxes, positioned only to take them out of flow, sitting
     * far enough down a long table to poke out of the bottom of the shell. The
     * document then scrolled by exactly how far the lowest one stuck out, so the
     * symptom grew and shrank with the window and with the length of the page.
     *
     * Making this wrapper a containing block ends it for every page at once —
     * page content can no longer reach past `<main>` to anchor itself, so the
     * scroll container clips it like anything else. It is deliberately here and
     * not on `<main>` (which we do not own) or on `styles.page` (whose padding
     * would then be inside the anchor). Note it changes nothing for the top bar
     * below: `position: sticky` is already a positioned ancestor, so that
     * subtree was never escaping.
     */
    position: 'relative',
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
  locations,
  sidebarCollapsed = false,
  session = null,
  banner = null,
  children,
}: {
  gymSlug: string | null;
  system: ShellSystemState;
  locations: ShellLocation[];
  /** The server-verified session, seeding the sidebar's first paint. */
  session?: Session | null;
  /** Sidebar collapse choice, seeded from its cookie by the console layout. */
  sidebarCollapsed?: boolean;
  /**
   * Full-width announcement pinned above the whole shell — today only the
   * impersonation bar. It goes through AppShell's own `banner` slot rather than
   * being rendered above `<AdminShell>` in the layout, because a sibling above a
   * `100dvh` shell makes the document exactly that much taller than the viewport:
   * the page scrolls again, and the side nav's last item is cut off by the height
   * of the bar. Inside the slot it is part of the pinned chrome and costs the
   * content column its height instead. Absent (`null`) most of the time, which
   * AppShell reads as "no header" — the layout is then byte-identical to one that
   * never had a banner.
   */
  banner?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('admin.common');

  return (
    <ToastProvider>
      <SkipLink>{t('skipToContent')}</SkipLink>
      <AppShell
        variant="wash"
        contentPadding={0}
        banner={banner}
        sideNav={
          <Sidebar
            gymSlug={gymSlug}
            system={system}
            defaultCollapsed={sidebarCollapsed}
            initialSession={session}
          />
        }
        mobileNav={{ hasToggle: false, breakpoint: 'md' }}
      >
        <div id="main-content" {...stylex.props(styles.content)}>
          <div {...stylex.props(styles.topBar)}>
            <TopBar locations={locations} />
          </div>
          <div {...stylex.props(styles.page)}>{children}</div>
        </div>
        {/* Right-edge AI copilot — floats above every console page. */}
        <AgentChat />
        {/* Palette playground — docked bottom-centre on every console screen so a
            colour can be judged against real pages rather than a swatch sheet. */}
      </AppShell>
    </ToastProvider>
  );
}
