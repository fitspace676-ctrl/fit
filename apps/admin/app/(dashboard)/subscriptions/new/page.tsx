import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { Icon } from '@/components/ui';
import { SubscriptionPlanForm } from '../subscription-plan-form';

export const metadata: Metadata = {
  title: 'New plan — Fit Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Create-a-subscription-plan page (T8.2). The middleware already requires a staff
 * session to reach `/subscriptions`, but creating is a `BillingManage` capability
 * that isn't held by every staff role (a RECEPTIONIST can read plans but not write
 * them), so the page itself gates on the permission and bounces an under-privileged
 * staffer to `/403`. The form and the Server Action it calls both re-check, and the
 * API enforces it again.
 */
export default async function NewSubscriptionPlanPage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.BillingManage)) {
    redirect('/403');
  }

  return (
    <div className="flex flex-col pb-24">
      <Link
        href="/subscriptions"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2.2} />
        Back to plans
      </Link>

      <header className="mb-5 flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          New plan
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Create a membership plan for your gym.
        </p>
      </header>

      <SubscriptionPlanForm mode="create" />
    </div>
  );
}
