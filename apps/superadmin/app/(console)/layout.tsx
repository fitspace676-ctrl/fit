import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Badge } from '@fit/ui-kit';
import { SignOutButton } from '@/components/sign-out-button';

/**
 * The signed-in console shell: a fixed rail on the left, the page beside it.
 *
 * Every route in this group renders inside it; `/login` and `/403` sit outside
 * the group precisely so they don't — a signed-out request has no console to
 * frame. `middleware.ts` has already authenticated the request and asserted
 * SUPER_ADMIN before anything here renders, so the shell never has to reason
 * about who it is drawing for.
 *
 * The rail carries one destination today. It is a rail rather than a top bar
 * because the destinations that follow (gym detail, audit) are siblings of it,
 * not children — and a list that grows downward costs nothing to extend.
 */
const styles = stylex.create({
  frame: {
    display: 'grid',
    gridTemplateColumns: '15rem 1fr',
    minHeight: '100vh',
    '@media (max-width: 48rem)': {
      gridTemplateColumns: '1fr',
    },
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '1.25rem',
    paddingBlock: '1.5rem',
    '@media (max-width: 48rem)': {
      borderRightStyle: 'none',
      borderBottomWidth: '1px',
      borderBottomStyle: 'solid',
      borderBottomColor: 'var(--color-border)',
    },
  },
  brand: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  wordmark: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  navLink: {
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textDecoration: 'none',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
    },
  },
  foot: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginTop: 'auto',
  },
  content: {
    minWidth: 0,
    paddingInline: '2rem',
    paddingBlock: '2rem',
  },
});

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div {...stylex.props(styles.frame)}>
      <aside {...stylex.props(styles.rail)}>
        <div {...stylex.props(styles.brand)}>
          <p {...stylex.props(styles.wordmark)}>FormaCore</p>
          <Badge label="Operator" tone="accent" />
        </div>

        <nav {...stylex.props(styles.nav)}>
          <a href="/" {...stylex.props(styles.navLink)}>
            Gyms
          </a>
        </nav>

        <div {...stylex.props(styles.foot)}>
          <SignOutButton />
        </div>
      </aside>

      <main {...stylex.props(styles.content)}>{children}</main>
    </div>
  );
}
