import type { Metadata } from 'next';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
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

  if (!canSell) {
    return (
      <div className="flex flex-col gap-2 p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Point of sale</h1>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          You don’t have permission to use the point of sale.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Point of sale</h1>
        <p className="hidden text-xs text-slate-400 sm:block">
          F1 search products · F2 find member · Esc clear sale
        </p>
      </header>
      <PosBoard />
    </div>
  );
}
