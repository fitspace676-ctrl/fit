import type { ReactNode } from 'react';

/**
 * Shared layout for the auth pages (login, register, forgot-password): a
 * centered card with a title, supporting copy, the form (`children`), and an
 * optional footer slot for cross-links. Rendered as a server component — titles
 * and copy are passed in already-translated so this stays presentational and
 * the interactive form lives in its own client component.
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-white px-gutter py-16">
      <div className="w-full max-w-md rounded-card border border-slate-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-6 text-center text-sm text-slate-500">{footer}</div> : null}
      </div>
    </main>
  );
}
