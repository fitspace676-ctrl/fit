'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProductStatus } from '@fit/types';
import { Btn, Card, Icon, buttonClasses } from '@/components/ui';
import { setProductActiveAction } from '../actions';

/**
 * The product detail page's write controls (T4.6), shown only to `ProductWrite`
 * staff (the server component gates rendering). An "Edit" link plus a deactivate /
 * reactivate toggle: an inactive product can be reactivated, an active one
 * deactivated. The lifecycle call goes through {@link setProductActiveAction}; on
 * success the router refreshes so the header pill reflects the new status, and any
 * error surfaces inline.
 */
export function ProductActions({
  productId,
  status,
}: {
  productId: string;
  status: ProductStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isInactive = status === 'INACTIVE';

  function toggle(): void {
    setError(null);
    startTransition(async () => {
      const result = await setProductActiveAction(productId, isInactive);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Link href={`/products/${productId}/edit`} className={buttonClasses('outline', 'sm')}>
          Edit
        </Link>
        <Btn
          v={isInactive ? 'primary' : 'outline'}
          size="sm"
          onClick={toggle}
          disabled={pending}
        >
          {pending ? 'Saving…' : isInactive ? 'Reactivate' : 'Deactivate'}
        </Btn>
      </div>
      {error ? (
        <Card
          role="alert"
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-danger-700 dark:text-danger-300"
        >
          <Icon name="info" className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </Card>
      ) : null}
    </div>
  );
}
