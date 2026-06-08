import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { SubscriptionPlanForm } from '../subscription-plan-form';

export const metadata: Metadata = {
  title: 'New subscription plan — Fit Admin',
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
    <div className="flex flex-col gap-6">
      <Link
        href="/subscriptions"
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← Back to subscriptions
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New subscription plan</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Add a recurring membership plan to your gym. Set its price, renewal cadence, and the
          features it includes.
        </p>
      </header>

      <SubscriptionPlanForm mode="create" />
    </div>
  );
}
