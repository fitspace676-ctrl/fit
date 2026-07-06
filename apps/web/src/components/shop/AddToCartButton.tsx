'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { encodeVariantRef, type ProductSummary } from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { Icon, useToast } from '@/src/components/ui';
import { addToCartAction } from '@/app/actions/cart';

// Astryx migration (T11.15): the quick add-to-cart control is rebuilt on the
// Astryx secondary `Button` over the Fit brand theme tokens — no Tailwind. The
// add / toast / refresh behaviour is unchanged.

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
    <Button
      variant="secondary"
      size="sm"
      icon={<Icon name="plus" />}
      label={pending ? t('adding') : t('add')}
      isLoading={pending}
      isDisabled={pending}
      onClick={add}
    />
  );
}
