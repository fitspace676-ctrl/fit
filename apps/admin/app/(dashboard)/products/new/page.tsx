import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { Icon } from '@/components/ui';
import { ProductForm } from '../product-form';

export const metadata: Metadata = {
  title: 'Add product — Fit Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Create-a-product page (T4.6). The middleware already requires a staff session to
 * reach `/products`, but creating is a `ProductWrite` capability that isn't linear
 * by role (a MANAGER has it, a RECEPTIONIST does not), so the page itself gates on
 * the permission and bounces an under-privileged staffer to `/403`. The form and
 * the Server Action it calls both re-check, and the API enforces it again.
 */
export default async function NewProductPage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ProductWrite)) {
    redirect('/403');
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/products"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        Back to shop
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Add product
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">
          List a new item in your gym’s shop. Set its price, upload an image gallery, and add any
          purchasable variants.
        </p>
      </header>

      <ProductForm mode="create" />
    </div>
  );
}
