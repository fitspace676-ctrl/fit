import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';

/**
 * Shared layout for the auth pages (login, register, forgot-password): a
 * centered branded panel with a title, supporting copy, the form (`children`),
 * and an optional footer slot for cross-links. Rendered as a server component —
 * titles and copy are passed in already-translated so this stays presentational
 * and the interactive form lives in its own client component.
 *
 * Astryx migration (T11.7): rebuilt on the Astryx `Card` surface with the Fit
 * brand theme tokens, authored entirely in compiled StyleX (`xstyle` /
 * `stylex.props`) — no Tailwind utilities. The soft accent aura behind the panel
 * is a StyleX radial-gradient reading `--color-accent`, so it stays theme-aware
 * in light and dark like the rest of the token layer.
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
  card: {
    width: '100%',
    maxWidth: '28rem',
    padding: '2rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
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
    marginTop: '2rem',
  },
  footer: {
    marginTop: '1.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main {...stylex.props(styles.main)}>
      <div aria-hidden {...stylex.props(styles.aura)} />

      <Card variant="default" padding={0} xstyle={styles.card}>
        <div {...stylex.props(styles.header)}>
          <h1 {...stylex.props(styles.title)}>{title}</h1>
          <p {...stylex.props(styles.subtitle)}>{subtitle}</p>
        </div>
        <div {...stylex.props(styles.body)}>{children}</div>
        {footer ? <div {...stylex.props(styles.footer)}>{footer}</div> : null}
      </Card>
    </main>
  );
}
