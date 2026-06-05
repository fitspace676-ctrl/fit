'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { PackageInterval, PackageSummary } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { fetchPackages } from '@/lib/packages';
import { CHECKOUT_LOCATION_KEY } from './StepLocation';

/** sessionStorage key the wizard persists the chosen package under (T3.9). */
export const CHECKOUT_PACKAGE_KEY = 'checkout_packageId';

export interface StepPackageProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
  /** `?locationId` from step 1 — scopes the catalogue and is preserved on Back. */
  locationId?: string;
  /** `?packageId` from the server — restores the selection after a refresh / Back. */
  initialPackageId?: string;
  /** Notified whenever the visitor picks a package card. */
  onSelect?: (packageId: string) => void;
}

/** Fetch lifecycle for the gym's packages. */
interface LoadState {
  packages: PackageSummary[];
  status: 'loading' | 'ready' | 'error';
}

/**
 * Step 2 of the purchase wizard: pick the membership package to buy. Fetches the
 * gym's packages (scoped by the location chosen in step 1) on mount, renders each
 * as a card (name, price, billing interval, perks, an optional "Most popular"
 * badge), and gates a "Continue" button on a selection. The choice is mirrored to
 * `sessionStorage` (and the URL on Continue) so a refresh or the browser Back
 * button from step 3 restores the highlighted card. A Back button returns to
 * step 1 with the location preserved.
 */
export function StepPackage({ gymId, locationId, initialPackageId, onSelect }: StepPackageProps) {
  const t = useTranslations('checkout');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [selectedId, setSelectedId] = useState<string | null>(initialPackageId ?? null);
  const [load, setLoad] = useState<LoadState>({ packages: [], status: 'loading' });

  // The price-line suffix for a billing interval (none for a one-off purchase).
  const intervalSuffix = useCallback(
    (interval: PackageInterval): string => {
      switch (interval) {
        case 'month':
          return t('packages.perMonth');
        case 'year':
          return t('packages.perYear');
        case 'one_time':
          return '';
      }
    },
    [t],
  );

  // Restore a prior selection from sessionStorage when the URL carried none
  // (e.g. a plain refresh of step 2). The URL wins when present, so this only
  // fills the gap; it runs once on mount.
  useEffect(() => {
    if (initialPackageId) {
      return;
    }
    const stored = window.sessionStorage.getItem(CHECKOUT_PACKAGE_KEY);
    if (stored) {
      setSelectedId(stored);
    }
  }, [initialPackageId]);

  // The location may be missing from the URL on a direct refresh; fall back to
  // the value step 1 persisted so the catalogue stays scoped to the same branch.
  const effectiveLocationId = useMemo(() => {
    if (locationId) {
      return locationId;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }
    return window.sessionStorage.getItem(CHECKOUT_LOCATION_KEY) ?? undefined;
  }, [locationId]);

  // Load the gym's packages; cancel the request if the step unmounts or the gym
  // changes. No gym in scope → nothing to load, settle as empty.
  useEffect(() => {
    if (!gymId) {
      setLoad({ packages: [], status: 'ready' });
      return;
    }

    const controller = new AbortController();
    setLoad((prev) => ({ packages: prev.packages, status: 'loading' }));

    fetchPackages({ gymId, locationId: effectiveLocationId, signal: controller.signal })
      .then((packages) => setLoad({ packages, status: 'ready' }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setLoad({ packages: [], status: 'error' });
      });

    return () => controller.abort();
  }, [gymId, effectiveLocationId]);

  const select = useCallback(
    (packageId: string) => {
      setSelectedId(packageId);
      window.sessionStorage.setItem(CHECKOUT_PACKAGE_KEY, packageId);
      onSelect?.(packageId);
    },
    [onSelect],
  );

  const onBack = useCallback(() => {
    const params = new URLSearchParams({ step: '1' });
    if (effectiveLocationId) {
      params.set('locationId', effectiveLocationId);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [effectiveLocationId, pathname, router]);

  const onContinue = useCallback(() => {
    if (!selectedId) {
      return;
    }
    const params = new URLSearchParams({ step: '3', packageId: selectedId });
    if (effectiveLocationId) {
      params.set('locationId', effectiveLocationId);
    }
    // Soft navigation (no full reload) so the wizard transitions in place.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [selectedId, effectiveLocationId, pathname, router]);

  if (load.status === 'loading') {
    return <p className="py-16 text-center text-sm text-slate-400">{t('packages.loading')}</p>;
  }

  if (load.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-slate-500">{t('packages.error')}</p>
        <button
          type="button"
          onClick={() => setLoad((prev) => ({ ...prev, status: 'loading' }))}
          className="rounded-card border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          {t('packages.retry')}
        </button>
      </div>
    );
  }

  if (load.packages.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm font-medium text-slate-900">{t('packages.empty.title')}</p>
          <p className="text-sm text-slate-500">{t('packages.empty.subtitle')}</p>
        </div>
        <div className="flex justify-start">
          <button
            type="button"
            onClick={onBack}
            className="rounded-card border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            {t('back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">{t('packages.title')}</h2>
        <p className="text-sm text-slate-500">{t('packages.subtitle')}</p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {load.packages.map((pkg) => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            locale={locale}
            selected={pkg.id === selectedId}
            priceSuffix={intervalSuffix(pkg.interval)}
            sessionsLabel={
              pkg.sessionCount === null
                ? t('packages.unlimited')
                : t('packages.sessions', { count: pkg.sessionCount })
            }
            popularLabel={t('packages.popular')}
            selectLabel={t('packages.select')}
            selectedLabel={t('packages.selected')}
            onSelect={() => select(pkg.id)}
          />
        ))}
      </ul>

      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-card border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          {t('back')}
        </button>
        <button
          type="button"
          disabled={!selectedId}
          onClick={onContinue}
          className="rounded-card bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {t('continue')}
        </button>
      </div>
    </div>
  );
}

/** A single selectable package card. */
function PackageCard({
  pkg,
  locale,
  selected,
  priceSuffix,
  sessionsLabel,
  popularLabel,
  selectLabel,
  selectedLabel,
  onSelect,
}: {
  pkg: PackageSummary;
  locale: string;
  selected: boolean;
  priceSuffix: string;
  sessionsLabel: string;
  popularLabel: string;
  selectLabel: string;
  selectedLabel: string;
  onSelect: () => void;
}) {
  // `priceAmount` is in minor units; format against the package's own currency.
  const price = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: pkg.currency,
        maximumFractionDigits: 2,
      }).format(pkg.priceAmount / 100),
    [locale, pkg.currency, pkg.priceAmount],
  );

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={`relative flex h-full w-full flex-col gap-4 rounded-card border p-5 text-left transition-colors ${
          selected
            ? 'border-brand-600 ring-1 ring-brand-600'
            : pkg.popular
              ? 'border-brand-300 hover:border-brand-400'
              : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        {pkg.popular ? (
          <span className="absolute -top-3 left-5 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
            {popularLabel}
          </span>
        ) : null}

        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-slate-900">{pkg.name}</span>
            <span className="text-xs font-medium text-slate-500">{sessionsLabel}</span>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {selected ? selectedLabel : selectLabel}
          </span>
        </div>

        <p className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-tight text-slate-900">{price}</span>
          {priceSuffix ? <span className="text-sm text-slate-500">{priceSuffix}</span> : null}
        </p>

        {pkg.description ? <p className="text-sm text-slate-500">{pkg.description}</p> : null}

        {pkg.features.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm text-slate-600">
            {pkg.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        ) : null}
      </button>
    </li>
  );
}
