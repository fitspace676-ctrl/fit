'use client';

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { LocaleSwitcher } from '@/src/components/LocaleSwitcher';
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
    gap: '0.625rem',
    textDecoration: 'none',
  },
  logoMark: {
    display: 'grid',
    placeItems: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  logoIcon: {
    height: '1.25rem',
    width: '1.25rem',
  },
  // The mark alone below `sm`. Opposite it sit two two-option segmented tracks —
  // light/dark and KA/EN — which come to ~184px on their own, and a 360px screen
  // has 312px between the gutters. With the wordmark the bar wanted ~358px of it
  // and simply ran off the edge. The bolt tile still carries the brand, which is
  // all it has to do on a screen the member is already signed in to; the name
  // stays in the link's accessible text.
  logoWord: {
    display: { default: 'none', '@media (min-width: 640px)': 'inline' },
    fontSize: '1.1875rem',
    fontWeight: 800,
    letterSpacing: '-0.025em',
    color: 'var(--color-text-primary)',
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

/** Brand mark — the lime bolt tile + wordmark, linking home. */
function Logo({ label }: { label: string }) {
  return (
    // Named on the link itself: below `sm` the wordmark is `display: none` and so
    // is out of the accessibility tree, which would leave the only link to the
    // dashboard announced as an unlabelled graphic.
    <Link href="/member/home" aria-label={label} {...stylex.props(styles.logo)}>
      <span {...stylex.props(styles.logoMark)}>
        <Icon name="bolt" sw={2.4} {...stylex.props(styles.logoIcon)} />
      </span>
      <span {...stylex.props(styles.logoWord)}>{label}</span>
    </Link>
  );
}

/** Persistent member-portal header: the brand mark, and the theme and language switches. */
export function MemberHeader() {
  const t = useTranslations('member');

  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.bar)}>
        <Logo label={t('shell.brand')} />

        <div {...stylex.props(styles.actions)}>
          <ThemeToggle />
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
