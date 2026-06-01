import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Access denied — Fit SuperAdmin',
  description: 'This console is restricted to platform operators.',
};

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-gutter text-center">
      <span className="rounded-card bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
        403
      </span>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Access denied</h1>
      <p className="max-w-sm text-slate-500">
        The Fit operator console is restricted to platform administrators. Sign in with a
        SUPER_ADMIN account to continue.
      </p>
    </main>
  );
}
