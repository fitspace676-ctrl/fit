'use client';

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { LocaleSwitcher } from '@/src/components/LocaleSwitcher';
import { PortalLogo } from './portal-logo';
import { ThemeToggle } from './theme-toggle';

// FormaCore redesign (T11.10) — the member shell, off Tailwind and onto compiled
// StyleX over the FormaCore theme, and matched to the `web-member-*` artboards
// measurement for measurement rather than approximately:
//
//   bar        80px tall, content capped at 1180px, 24px gutter (40px from lg)
//   logo       40px lime tile at the `inner` radius, 19px extrabold wordmark
//   actions    40px controls on the `--fc-control` surface
//
// The header carries NO navigation and, now, no account control either. The
// primary nav is the floating capsule in `bottom-nav.tsx`, at every width — see
// the note there — and the notification bell and the avatar went down to that
// same rail: where do I go, what happened while I was away and who am I are one
// reachable row at the foot of the screen rather than a bar the thumb cannot
// reach. What is left up here is the brand mark and the two switches, which is
// why the bar keeps its height but loses its middle.
//
// The cart shortcut went too, and the language switch took its place. The cart is
// reached from the shop, where a basket is something you are already carrying;
// parked in the chrome it was a permanent affordance for a page most visits never
// touch. Language is the opposite — it belongs beside the theme switch, the pair
// the auth screens already show together, because both change how the whole
// portal reads rather than where you are in it.

const styles = stylex.create({
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    // No rule under the bar. It had one when the header carried the navigation
    // and needed to read as a separate deck; with the nav moved to the floating
    // capsule, the header is just a brand mark and two switches sitting on the
    // canvas, and a full-width line across the page only drew a seam where there
    // is no longer a division. Scroll separation is the translucency's job.
    //
    // The artboards' one translucent surface: the canvas at 95% behind a small
    // blur, so content scrolling under the bar is sensed but never legible.
    backgroundColor: 'var(--fc-header)',
    backdropFilter: 'blur(8px)',
  },
  bar: {
    marginInline: 'auto',
    display: 'flex',
    height: '5rem',
    width: '100%',
    maxWidth: '1180px',
    alignItems: 'center',
    // Tighter on a phone, where the bar has little to spare even with the brand
    // reduced to its mark.
    gap: { default: '0.75rem', '@media (min-width: 640px)': '1.5rem' },
    // The gutter stays 24px so the logo lines up with the page content beneath
    // it — the bar is squeezed by dropping the wordmark, not by moving the edge.
    paddingInline: {
      default: '1.5rem',
      '@media (min-width: 1024px)': '2.5rem',
    },
  },

  /* --------------------------------- brand -------------------------------- */
  logo: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    textDecoration: 'none',
  },

  /* -------------------------------- actions ------------------------------- */
  actions: {
    marginInlineStart: 'auto',
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.5rem',
  },
});

/**
 * Brand mark — the gym's own logo, or the theme-swapped FormaCore wordmark when it
 * has uploaded none — linking home. See `PortalLogo` for why one uploaded file
 * cannot use the swap the bundled pair does.
 */
function Logo({ label, logoUrl }: { label: string; logoUrl: string | null }) {
  return (
    <Link href="/member/home" aria-label={label} {...stylex.props(styles.logo)}>
      <PortalLogo logoUrl={logoUrl} />
    </Link>
  );
}

export interface MemberHeaderProps {
  /**
   * The tenant's mark, resolved API-side through `memberPortal.logoUrl ??
   * brand.logoUrl`, or `null` for the bundled wordmark.
   *
   * Passed IN rather than fetched here: this is a client component (the two
   * switches need it), and the tenant lookup is server-only — it reads the
   * request `Host` to work out which gym is being served. The layout that renders
   * this header is a Server Component and already has the answer, so the value
   * travels as a prop instead of turning the header into a second network call
   * that would also flash the wrong mark on first paint.
   */
  logoUrl?: string | null;
}

/** Persistent member-portal header: the brand mark, and the theme and language switches. */
export function MemberHeader({ logoUrl = null }: MemberHeaderProps) {
  const t = useTranslations('member');

  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.bar)}>
        <Logo label={t('shell.brand')} logoUrl={logoUrl} />

        <div {...stylex.props(styles.actions)}>
          <ThemeToggle />
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
