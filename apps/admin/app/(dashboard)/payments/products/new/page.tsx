import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { Icon } from '@/components/ui';
import { ProductForm } from '../product-form';

export const metadata: Metadata = {
  title: 'New product — Fit Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    alignSelf: 'flex-start',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-accent)',
  },
  backIcon: {
    width: '1rem',
    height: '1rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * Create-a-product page (T4.6), rebuilt on brand-tokened StyleX (T11.22). The
 * middleware already requires a staff session to reach `/payments/products`, but creating is
 * a `ProductWrite` capability that isn't linear by role (a MANAGER has it, a
 * RECEPTIONIST does not), so the page itself gates on the permission and bounces an
 * under-privileged staffer to `/403`. The form and the Server Action it calls both
 * re-check, and the API enforces it again.
 */
export default async function NewProductPage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ProductWrite)) {
    redirect('/403');
  }

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/payments/products" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        Back to products
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>New product</h1>
        <p {...stylex.props(styles.subtitle)}>
          Add a product to your gym’s store. Set its price, upload an image gallery, and add any
          purchasable variants.
        </p>
      </header>

      <ProductForm mode="create" />
    </div>
  );
}
