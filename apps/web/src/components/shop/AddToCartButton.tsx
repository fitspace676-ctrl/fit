'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { encodeVariantRef, type ProductSummary } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Btn, useToast } from '@/src/components/ui';
import { addToCartAction } from '@/app/actions/cart';

/**
 * Quick add-to-cart for a product card: adds the first variant (or the base
 * purchase when the product has none), toasts the result, and refreshes so the
 * header cart reflects the change.
 */
export function AddToCartButton({ product }: { product: ProductSummary }) {
  const t = useTranslations('member.cart');
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const variantId =
    product.variants.length > 0
      ? encodeVariantRef(product.id, 0)
      : encodeVariantRef(product.id, null);

  function add(): void {
    startTransition(async () => {
      const res = await addToCartAction(variantId, 1);
      if (res.ok) {
        toast(t('added'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(res.code === 'UNAUTHENTICATED' ? t('signInToAdd') : t('errAdd'), {
          tone: 'danger',
          icon: 'x',
        });
      }
    });
  }

  return (
    <Btn v="outline" size="sm" icon="plus" disabled={pending} onClick={add}>
      {pending ? t('adding') : t('add')}
    </Btn>
  );
}
