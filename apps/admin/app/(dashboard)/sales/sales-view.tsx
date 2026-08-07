'use client';

// The Sales tab.
//
// Laid out on the Overview's own work-area grid — a main column carrying the two
// trends and a rail that sticks on wide screens carrying the snapshots — so the
// two tabs read as one dashboard rather than two designs.
//
// Both controls are owned HERE, not by the card that displays them: they scope
// the whole tab, and one round trip recomputes everything. A per-card fetch could
// leave the KPI strip describing one window while the chart beneath it described
// another, and the numbers would not reconcile.
//
// Fetch/cache/retry follows `segments/segment-panel.tsx`: responses are cached by
// the composite of both controls for the page's life, so flipping back to a
// visited combination is instant; a failure is an inline alert scoped to the tab,
// and Retry drops only its own cache entry.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import {
  DEFAULT_SALES_GRANULARITY,
  DEFAULT_SALES_PRODUCT_TYPE,
  type DashboardSalesResponse,
  type SalesGranularity,
  type SalesProductType,
} from '@fit/types';
import { loadSalesAction } from './actions';
import { SalesKpiStrip } from './sales-kpi-strip';
import { SalesTrendCard } from './sales-trend-card';
import { SalesVsRefundsCard } from './sales-vs-refunds-card';
import { PaymentMethodCard } from './payment-method-card';
import { TopSellersCard } from './top-sellers-card';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  workArea: {
    display: 'grid',
    gap: '1.5rem',
    alignItems: 'start',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'minmax(0, 2.2fr) minmax(280px, 1fr)',
    },
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    // `minWidth: 0` stops a wide chart from forcing the grid track wider than its
    // share — the standard grid-blowout guard.
    minWidth: 0,
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    minWidth: 0,
    position: {
      default: 'static',
      '@media (min-width: 1280px)': 'sticky',
    },
    // Clears the console's fixed chrome, then a little breathing room.
    top: '5rem',
    maxHeight: {
      default: 'none',
      '@media (min-width: 1280px)': 'calc(100dvh - 6rem)',
    },
    overflowY: {
      default: 'visible',
      '@media (min-width: 1280px)': 'auto',
    },
  },
  status: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '3rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  skeleton: {
    height: '24rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-surface-muted)',
  },
  pending: {
    opacity: 0.7,
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
  },
});

export function SalesView() {
  const t = useTranslations('admin.dashboard.sales');
  const locale = useLocale();

  const [granularity, setGranularity] = useState<SalesGranularity>(DEFAULT_SALES_GRANULARITY);
  const [productType, setProductType] = useState<SalesProductType>(DEFAULT_SALES_PRODUCT_TYPE);

  // Cached responses survive re-renders and control changes for the page's life.
  const cache = useRef(new Map<string, DashboardSalesResponse>());
  const [data, setData] = useState<DashboardSalesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const key = `${granularity}:${productType}`;

  useEffect(() => {
    const cached = cache.current.get(key);
    if (cached) {
      setData(cached);
      setError(null);
      setPending(false);
      return;
    }

    let cancelled = false;
    setError(null);
    setPending(true);
    void loadSalesAction({ granularity, productType }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        cache.current.set(key, result.data);
        setData(result.data);
      } else {
        setError(result.error);
      }
      setPending(false);
    });
    return () => {
      cancelled = true;
    };
    // `attempt` is in the deps purely to force a re-run on retry; the cache
    // bypass itself comes from `retry` deleting this key first.
  }, [key, granularity, productType, attempt]);

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: data?.currency ?? 'USD',
        maximumFractionDigits: 0,
      }),
    [data?.currency, locale],
  );

  /**
   * Retry the combination currently on screen. Deleting its own cache entry
   * scopes the bypass to THIS combination — every other cached response stays.
   */
  const retry = useCallback(() => {
    cache.current.delete(key);
    setAttempt((n) => n + 1);
  }, [key]);

  if (error !== null) {
    return (
      <div role="alert" {...stylex.props(styles.status)}>
        <span>{error}</span>
        <Button variant="secondary" size="sm" label={t('retry')} onClick={retry} />
      </div>
    );
  }

  if (data === null) {
    return <div {...stylex.props(styles.skeleton)} aria-hidden="true" />;
  }

  const netTotal = data.revenueOverTime.reduce((sum, point) => sum + point.value, 0);

  return (
    <div {...stylex.props(styles.page, pending && styles.pending)}>
      <SalesKpiStrip
        kpis={data.kpis}
        granularity={data.granularity}
        productType={data.productType}
        money={money}
      />

      <div {...stylex.props(styles.workArea)}>
        <div {...stylex.props(styles.column)}>
          <SalesTrendCard
            points={data.revenueOverTime}
            granularity={granularity}
            productType={productType}
            total={netTotal}
            money={money}
            onSelectGranularity={setGranularity}
            onSelectProductType={setProductType}
            disabled={pending}
          />
          <SalesVsRefundsCard points={data.salesVsRefunds} />
        </div>

        {/*
          The rail is the snapshots — how the money arrived and what sold. It
          sticks on wide screens so scrolling the trends never scrolls the
          breakdown off the page.
        */}
        <div {...stylex.props(styles.rail)}>
          <PaymentMethodCard slices={data.byPaymentMethod} money={money} />
          <TopSellersCard rows={data.topSellers} money={money} />
        </div>
      </div>
    </div>
  );
}
