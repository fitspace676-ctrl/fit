import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Access denied — Fit',
  description: 'You do not have permission to view this page.',
};

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-gutter text-center">
      <span className="rounded-card bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
        403
      </span>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Access denied</h1>
      <p className="max-w-sm text-slate-500">
        Your account doesn’t have permission to view this page. If you think this is a mistake,
        contact your gym administrator.
      </p>
      <Link href="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
        Back to home
      </Link>
    </main>
  );
}
