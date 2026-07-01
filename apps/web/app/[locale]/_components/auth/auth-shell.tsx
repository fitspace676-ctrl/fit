import type { ReactNode } from 'react';
import { Card } from '@/src/components/ui';

/**
 * Shared layout for the auth pages (login, register, forgot-password): a
 * centered branded panel with a title, supporting copy, the form (`children`),
 * and an optional footer slot for cross-links. Rendered as a server component —
 * titles and copy are passed in already-translated so this stays presentational
 * and the interactive form lives in its own client component.
 *
 * Reskinned onto formacore: a formacore aurora backdrop and a `Card` panel with
 * `font-display` heading, consistent with the redesigned member portal.
 */
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
    <main className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-gutter py-16">
      {/* Formacore aurora: soft brand/iris blobs behind the panel. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-24 -top-32 h-[520px] w-[520px] rounded-full bg-iris-500/10 blur-[140px] dark:bg-iris-600/25" />
        <div className="absolute -bottom-32 -right-16 h-[520px] w-[520px] rounded-full bg-brand-500/[0.09] blur-[150px] dark:bg-brand-500/25" />
      </div>

      <Card glow className="w-full max-w-md p-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white">
            {title}
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>
        </div>
        <div className="mt-8">{children}</div>
        {footer ? (
          <div className="mt-6 text-center text-sm text-ink-500 dark:text-ink-400">{footer}</div>
        ) : null}
      </Card>
    </main>
  );
}
