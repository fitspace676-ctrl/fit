import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';

/**
 * Two-panel layout for the tenant subdomain's front door: signing in on one
 * side, joining the gym on the other.
 *
 * A visitor landing on `<slug>.<root>` is one of two people — a member coming
 * back, or someone who has never been here — and the page has to serve both
 * without making either feel like the afterthought. So this is a genuine split
 * rather than a form with a link under it: each side is its own {@link Card} with
 * its own heading and call to action.
 *
 * Below `56rem` (roughly a tablet in portrait) the two panels stack, sign-in
 * first: on a phone the split reads as one long column anyway, and a returning
 * member should not have to scroll past a sales pitch to reach the password
 * field.
 *
 * Shares {@link import('./auth-shell').AuthShell}'s chrome — the same background
 * aura over `--color-background-body`, the same Astryx `Card` surface, compiled
 * StyleX throughout on the Fit brand theme tokens, no Tailwind.
 */

const styles = stylex.create({
  main: {
    position: 'relative',
    isolation: 'isolate',
    display: 'flex',
    minHeight: '100vh',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingInline: '1.5rem',
    paddingBlock: '4rem',
    backgroundColor: 'var(--color-background-body)',
  },
  aura: {
    pointerEvents: 'none',
    position: 'absolute',
    inset: 0,
    zIndex: -1,
    backgroundImage:
      'radial-gradient(60% 55% at 12% -5%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 70%), radial-gradient(55% 45% at 92% 105%, color-mix(in srgb, var(--color-accent) 13%, transparent), transparent 70%)',
  },
  grid: {
    display: 'grid',
    width: '100%',
    maxWidth: '58rem',
    alignItems: 'stretch',
    gap: '1.5rem',
    // Single column on narrow viewports, two equal columns from `56rem` up.
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 56rem)': '1fr 1fr',
    },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    padding: '2rem',
  },
  /**
   * The join panel is the page's promoted path, so it carries a tinted surface
   * and an accent hairline — enough to read as "this one is for you" at a glance
   * without shouting over the sign-in form beside it.
   */
  promoted: {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 6%, var(--color-background-surface))',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 24%, transparent)',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.375rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  body: {
    marginTop: '1.75rem',
    // Grow into the taller sibling so both panels end level, and let each panel's
    // own footer/CTA sit at the bottom of that space.
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
  },
  /**
   * The page-level `h1`. Each panel already carries a visible `h2`, and a third
   * visible heading above them would be noise — but a page with no `h1` breaks
   * the heading outline screen-reader users navigate by, so it is present and
   * clipped rather than omitted.
   */
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
});

/** One side of the split — a titled card wrapping its own content. */
export function AuthSplitPanel({
  title,
  subtitle,
  promoted = false,
  children,
}: {
  title: string;
  subtitle: string;
  /** Render as the promoted path (tinted surface + accent hairline). */
  promoted?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      variant="default"
      padding={0}
      xstyle={promoted ? [styles.card, styles.promoted] : styles.card}
    >
      <div {...stylex.props(styles.header)}>
        <h2 {...stylex.props(styles.title)}>{title}</h2>
        <p {...stylex.props(styles.subtitle)}>{subtitle}</p>
      </div>
      <div {...stylex.props(styles.body)}>{children}</div>
    </Card>
  );
}

/** The page frame holding the two {@link AuthSplitPanel}s. */
export function AuthSplitShell({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <main {...stylex.props(styles.main)}>
      <div aria-hidden {...stylex.props(styles.aura)} />
      <h1 {...stylex.props(styles.srOnly)}>{heading}</h1>
      <div {...stylex.props(styles.grid)}>{children}</div>
    </main>
  );
}
