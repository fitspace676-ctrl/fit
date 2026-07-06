'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import type { PackageInterval, PackageSummary } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { fetchPackages } from '@/lib/packages';
import { CHECKOUT_LOCATION_KEY } from './StepLocation';

/** sessionStorage key the wizard persists the chosen package under (T3.9). */
export const CHECKOUT_PACKAGE_KEY = 'checkout_packageId';

// Astryx migration (T11.15): step 2 (pick package) is rebuilt on the Fit brand
// theme — selectable package cards, the feature checklist and status states
// authored in compiled StyleX (`var(--color-*)` / `var(--radius-*)`), the
// "Most popular" flag on the Astryx `Badge` and Back / Continue on the Astryx
// `Button` — no Tailwind utilities. Fetch, selection persistence and navigation
// are unchanged.
const styles = stylex.create({
  status: {
    paddingBlock: '4rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    paddingBlock: '4rem',
    textAlign: 'center',
  },
  centeredTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  centeredText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  grid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  card: {
    position: 'relative',
    display: 'flex',
    height: '100%',
    width: '100%',
    flexDirection: 'column',
    gap: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    padding: '1.25rem',
    textAlign: 'left',
    cursor: 'pointer',
    backgroundColor: 'var(--color-background-card)',
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
  },
  cardIdle: {
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-border-emphasized)',
    },
  },
  cardPopular: {
    borderColor: {
      default: 'var(--color-accent-muted)',
      ':hover': 'var(--color-accent)',
    },
  },
  cardSelected: {
    borderColor: 'var(--color-accent)',
    boxShadow: 'inset 0 0 0 1px var(--color-accent)',
  },
  popularBadge: {
    position: 'absolute',
    top: '-0.75rem',
    left: '1.25rem',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  name: {
    margin: 0,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  sessions: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  pill: {
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
  },
  pillIdle: {
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  pillSelected: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  priceRow: {
    margin: 0,
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.25rem',
  },
  price: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  priceSuffix: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  description: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  features: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  feature: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
  },
  featureIcon: {
    marginTop: '0.125rem',
    height: '1rem',
    width: '1rem',
    flexShrink: 0,
    color: 'var(--color-text-accent)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  actionsStart: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
});

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
    return <p {...stylex.props(styles.status)}>{t('packages.loading')}</p>;
  }

  if (load.status === 'error') {
    return (
      <div {...stylex.props(styles.centered)}>
        <p {...stylex.props(styles.centeredText)}>{t('packages.error')}</p>
        <Button
          variant="secondary"
          size="md"
          label={t('packages.retry')}
          onClick={() => setLoad((prev) => ({ ...prev, status: 'loading' }))}
        />
      </div>
    );
  }

  if (load.packages.length === 0) {
    return (
      <div {...stylex.props(styles.root)}>
        <div {...stylex.props(styles.centered)}>
          <p {...stylex.props(styles.centeredTitle)}>{t('packages.empty.title')}</p>
          <p {...stylex.props(styles.centeredText)}>{t('packages.empty.subtitle')}</p>
        </div>
        <div {...stylex.props(styles.actionsStart)}>
          <Button variant="secondary" size="md" label={t('back')} onClick={onBack} />
        </div>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.heading)}>
        <h2 {...stylex.props(styles.title)}>{t('packages.title')}</h2>
        <p {...stylex.props(styles.subtitle)}>{t('packages.subtitle')}</p>
      </div>

      <ul {...stylex.props(styles.grid)}>
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

      <div {...stylex.props(styles.actions)}>
        <Button variant="secondary" size="md" label={t('back')} onClick={onBack} />
        <Button
          variant="primary"
          size="md"
          label={t('continue')}
          isDisabled={!selectedId}
          onClick={onContinue}
        />
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
        {...stylex.props(
          styles.card,
          selected ? styles.cardSelected : pkg.popular ? styles.cardPopular : styles.cardIdle,
        )}
      >
        {pkg.popular ? (
          <span {...stylex.props(styles.popularBadge)}>
            <Badge variant="purple" label={popularLabel} />
          </span>
        ) : null}

        <div {...stylex.props(styles.cardHead)}>
          <div style={{ minWidth: 0 }}>
            <p {...stylex.props(styles.name)}>{pkg.name}</p>
            <p {...stylex.props(styles.sessions)}>{sessionsLabel}</p>
          </div>
          <span {...stylex.props(styles.pill, selected ? styles.pillSelected : styles.pillIdle)}>
            {selected ? selectedLabel : selectLabel}
          </span>
        </div>

        <p {...stylex.props(styles.priceRow)}>
          <span {...stylex.props(styles.price)}>{price}</span>
          {priceSuffix ? <span {...stylex.props(styles.priceSuffix)}>{priceSuffix}</span> : null}
        </p>

        {pkg.description ? <p {...stylex.props(styles.description)}>{pkg.description}</p> : null}

        {pkg.features.length > 0 ? (
          <ul {...stylex.props(styles.features)}>
            {pkg.features.map((feature) => (
              <li key={feature} {...stylex.props(styles.feature)}>
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                  {...stylex.props(styles.featureIcon)}
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
