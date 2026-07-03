import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchSubscriptionPlan } from '@/lib/api';
import { Badge, Dot, Icon } from '@/components/ui';
import { SubscriptionPlanForm } from '../../subscription-plan-form';

export const metadata: Metadata = {
  title: 'Edit plan — Fit Admin',
};

// Reflects the staff session and writes live plan state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Edit-a-subscription-plan page (T8.2). Like {@link NewSubscriptionPlanPage} it
 * gates on the `BillingManage` capability before rendering, and reuses the shared
 * {@link SubscriptionPlanForm} prefilled from `GET /admin/subscriptions/:id`. A
 * `404` from the API — unknown or cross-tenant id — becomes Next's `notFound()`.
 */
export default async function EditSubscriptionPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.BillingManage)) {
    redirect('/403');
  }

  let plan;
  try {
    plan = await fetchSubscriptionPlan(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this subscription plan (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/subscriptions"
          className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2.2} />
          Back to plans
        </Link>
        <p
          role="alert"
          className="rounded-card border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-700 dark:text-danger-300"
        >
          {message}
        </p>
      </div>
    );
  }

  const isActive = plan.status === 'ACTIVE';

  return (
    <div className="flex flex-col pb-24">
      <Link
        href={`/subscriptions/${id}`}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2.2} />
        Back to plans
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Edit plan
        </h1>
        <Badge tone={isActive ? 'success' : 'ink'}>
          <Dot c={isActive ? 'bg-success-400' : 'bg-ink-400'} />
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <SubscriptionPlanForm
        mode="edit"
        planId={id}
        initial={{
          name: plan.name,
          description: plan.description,
          priceAmount: plan.priceAmount,
          currency: plan.currency,
          interval: plan.interval,
          features: plan.features,
          popular: plan.popular,
          status: plan.status,
        }}
      />
    </div>
  );
}
