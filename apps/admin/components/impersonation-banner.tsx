'use client';

import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { ImpersonationMeta } from '@/lib/impersonation';

/** This app's basePath behind the tenant proxy — mirrors `middleware.ts`. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '/admin';

const styles = stylex.create({
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '0.75rem',
    paddingInline: '1rem',
    paddingBlock: '0.5rem',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    // Above the shell's own sticky chrome: the one thing on screen that must
    // never be scrolled past is the fact that this is not your account. The bar
    // now rides in AppShell's pinned banner slot, where nothing scrolls and
    // `sticky` therefore behaves as `relative` — kept anyway, so the guarantee
    // survives being rendered anywhere else.
    position: 'sticky',
    insetBlockStart: 0,
    zIndex: 60,
  },
  detail: {
    fontWeight: 500,
    opacity: 0.85,
  },
  clock: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  exit: {
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.625rem',
    paddingBlock: '0.1875rem',
    backgroundColor: {
      default: 'color-mix(in srgb, var(--color-on-accent) 16%, transparent)',
      ':hover': 'color-mix(in srgb, var(--color-on-accent) 28%, transparent)',
    },
    color: 'inherit',
    textDecoration: 'none',
  },
});

/** `9:41` — minutes and seconds left, or `0:00` once the session is spent. */
function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * The bar that says "this is not your account".
 *
 * Rendered only while an impersonation cookie is present, above every console
 * screen. It names the gym and the owner being acted as, and counts the session
 * down — because an impersonated token expires in minutes and, unlike an
 * ordinary session, nothing renews it. Without the clock the first sign that it
 * ran out is a redirect mid-task.
 *
 * The countdown ticks client-side from a server-supplied deadline rather than
 * from a duration, so a tab left open and returned to shows the real remaining
 * time rather than resuming from wherever it was suspended.
 */
export function ImpersonationBanner({ meta }: { meta: ImpersonationMeta }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, meta.expiresAt - Math.floor(Date.now() / 1000)),
  );

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, meta.expiresAt - Math.floor(Date.now() / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [meta.expiresAt]);

  return (
    <div role="status" {...stylex.props(styles.bar)}>
      <span>
        Impersonating {meta.gymName}
        <span {...stylex.props(styles.detail)}> as {meta.ownerEmail}</span>
      </span>
      <span {...stylex.props(styles.clock)}>
        {remaining > 0 ? `${formatRemaining(remaining)} left` : 'session expired'}
      </span>
      <a href={`${BASE_PATH}/impersonation/exit`} {...stylex.props(styles.exit)}>
        Exit
      </a>
    </div>
  );
}
