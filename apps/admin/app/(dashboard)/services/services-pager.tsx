'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@fit/ui-kit';

const styles = stylex.create({
  pagerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pagerCount: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  pagerBtns: {
    display: 'flex',
    gap: '0.5rem',
  },
});

/**
 * The services catalogue's pager — "from-to of total" plus Previous / Next
 * writing the `page` URL param, mirroring `../shop/products-grid.tsx`'s pager.
 * The page only mounts this once there is more than one page of results.
 */
export function ServicesPager({
  total,
  page,
  limit,
}: {
  total: number;
  page: number;
  limit: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function hrefWith(overrides: Record<string, string>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  return (
    <div {...stylex.props(styles.pagerRow)}>
      <span {...stylex.props(styles.pagerCount)}>
        {from}–{to} of {total}
      </span>
      <div {...stylex.props(styles.pagerBtns)}>
        <Button
          variant="secondary"
          size="inline"
          onClick={() =>
            startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
          }
          disabled={!hasPrev}
          label="Previous"
        />
        <Button
          variant="secondary"
          size="inline"
          onClick={() =>
            startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
          }
          disabled={!hasNext}
          label="Next"
        />
      </div>
    </div>
  );
}
