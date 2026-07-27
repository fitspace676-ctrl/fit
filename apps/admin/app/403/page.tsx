import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, buttonClasses, Icon } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Access denied - Fit Admin',
  description: 'You do not have permission to view this page.',
};

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50 p-gutter text-center dark:bg-ink-950">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-300">
        <Icon name="lock" className="h-6 w-6" sw={2} />
      </span>
      <Badge tone="danger">403</Badge>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900 dark:text-white">
        Access denied
      </h1>
      <p className="max-w-sm text-ink-500 dark:text-ink-400">
        Your account doesn’t have permission to view this part of the admin console. If you think
        this is a mistake, contact your gym owner.
      </p>
      <Link href="/" className={buttonClasses('outline', 'md')}>
        Back to dashboard
      </Link>
    </main>
  );
}
