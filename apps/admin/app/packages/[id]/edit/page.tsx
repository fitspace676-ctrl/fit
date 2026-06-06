import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchPackagePlan } from '@/lib/api';
import { PackagePlanForm } from '../../package-plan-form';

export const metadata: Metadata = {
  title: 'Edit package plan — Fit Admin',
};

// Reflects the staff session and writes live plan state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Edit-a-package-plan page (T4.11). Like {@link NewPackagePlanPage} it gates on the
 * `PackageWrite` capability (not linear by role) before rendering, and reuses the
 * shared {@link PackagePlanForm} prefilled from `GET /admin/packages/:id`. A `404`
 * from the API — unknown or cross-tenant id — becomes Next's `notFound()`.
 */
export default async function EditPackagePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.PackageWrite)) {
    redirect('/403');
  }

  let plan;
  try {
    plan = await fetchPackagePlan(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this package plan (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div className="flex flex-col gap-4">
        <Link href="/packages" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Back to packages
        </Link>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/packages/${id}`}
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← Back to plan
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit package plan</h1>
        <p className="text-sm text-slate-500">
          Update {plan.name}’s details, price, billing cadence, sessions, and features.
        </p>
      </header>

      <PackagePlanForm
        mode="edit"
        planId={id}
        initial={{
          name: plan.name,
          description: plan.description,
          priceAmount: plan.priceAmount,
          currency: plan.currency,
          billingInterval: plan.billingInterval,
          sessionCount: plan.sessionCount,
          features: plan.features,
          popular: plan.popular,
        }}
      />
    </div>
  );
}
