import type { Metadata } from 'next';
import Link from 'next/link';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { Card, Icon } from '@/components/ui';
import { PosBoard } from '@/components/pos/pos-board';

export const metadata: Metadata = {
  title: 'Point of sale — Fit Admin',
  description:
    'The gym’s in-person point of sale: search products, build a cart with quantity and discounts, and attach the sale to a member by name, phone, or QR scan.',
};

// The POS reflects the live catalogue and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * The point-of-sale workspace (T7.2). The `/pos` route already requires staff
 * (middleware), and the POS reuses the tenant-scoped product/member endpoints
 * which enforce `ProductRead` / `MemberRead` API-side; selling is a product-read
 * capability every front-desk role (RECEPTIONIST and up) holds, so the page gates
 * on `ProductRead` and renders a forbidden notice rather than a broken board for
 * anyone without it.
 *
 * The cart itself is in-memory (a client Zustand store), so the page is a thin
 * server shell: it checks the capability, then hands off to the client board.
 */
export default async function PosPage() {
  const session = await getServerSession();
  const canSell = session !== null && roleHasPermission(session.role, Permission.ProductRead);
  const canReconcile = session !== null && roleHasPermission(session.role, Permission.BillingRead);

  if (!canSell) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Point of sale
        </h1>
        <Card
          role="alert"
          className="flex items-center gap-3 p-4 text-sm text-danger-700 dark:text-danger-300"
        >
          <Icon name="info" className="h-5 w-5 shrink-0" />
          <span>You don’t have permission to use the point of sale.</span>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-2xl">
          Point of sale
        </h1>
        <div className="flex items-baseline gap-4">
          <p className="hidden text-xs text-ink-400 sm:block">
            F1 search products · F2 find member · Esc clear sale
          </p>
          {canReconcile ? (
            <Link
              href="/pos/reconciliation"
              className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
            >
              End-of-day report
            </Link>
          ) : null}
        </div>
      </header>
      <PosBoard />
    </div>
  );
}
