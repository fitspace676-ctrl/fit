'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import type {
  CheckoutProductType,
  PackageInterval,
  PackageSummary,
  SignupCatalogueResponse,
} from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { fetchSignupCatalogue } from '@/lib/signup';
import { PRODUCT_TABS, toCards } from './product-cards';
import { CHECKOUT_LOCATION_KEY } from './StepLocation';
import { createNumberFormat } from '@fit/i18n';

/** sessionStorage key the wizard persists the chosen product's id under (T3.9). */
export const CHECKOUT_PACKAGE_KEY = 'checkout_packageId';

/**
 * sessionStorage key the wizard persists the chosen product's *catalogue* under.
 * The id alone is ambiguous — packages, subscriptions and credit packs are three
 * different tables — so the type has to survive a refresh alongside it, or the
 * payment step would not know which purchase to make.
 */
export const CHECKOUT_PRODUCT_TYPE_KEY = 'checkout_productType';

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
  /**
   * The catalogue switcher. A `tablist` rather than a select: there are only
   * three options and they are the step's primary structure, so they stay
   * visible and one keystroke apart.
   */
  tabs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
    borderRadius: 'var(--radius-element)',
    padding: '0.25rem',
    backgroundColor: 'var(--color-background-subtle)',
  },
  tab: {
    appearance: 'none',
    cursor: 'pointer',
    borderWidth: 0,
    borderRadius: 'calc(var(--radius-element) - 0.125rem)',
    paddingInline: '0.875rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  tabActive: {
    color: 'var(--color-text-on-accent)',
    backgroundColor: 'var(--color-accent)',
  },
  tabIdle: {
    color: 'var(--color-text-secondary)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
    },
  },
  /** Count suffix on a tab label — dimmed so it reads as metadata. */
  tabCount: {
    marginInlineStart: '0.375rem',
    opacity: 0.7,
  },
  /** The per-tab empty state, kept inside the step so the tabs stay reachable. */
  tabEmpty: {
    margin: 0,
    paddingBlock: '3rem',
    textAlign: 'center',
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
  /** `?productType` from the server — restores which tab the selection came from. */
  initialProductType?: CheckoutProductType;
  /** Notified whenever the visitor picks a product card. */
  onSelect?: (productId: string, productType: CheckoutProductType) => void;
}

/** Fetch lifecycle for the gym's catalogue. */
interface LoadState {
  catalogue: SignupCatalogueResponse | null;
  status: 'loading' | 'ready' | 'error';
}

/** An empty catalogue — the shape rendered before the fetch settles. */
const EMPTY_CATALOGUE: SignupCatalogueResponse = {
  locations: [],
  packages: [],
  subscriptionPlans: [],
  creditPacks: [],
};

/**
 * Step 2 of the purchase wizard: pick what to buy. Fetches the gym's whole
 * catalogue on mount and splits it across three tabs — packages, subscriptions
 * and session (credit) packs — rendering each entry as the same selectable card
 * (name, price, cadence, perks, an optional "Most popular" badge) and gating
 * "Continue" on a selection.
 *
 * Both halves of the choice are carried forward: an id alone is ambiguous across
 * three catalogues, so the *type* travels with it through `sessionStorage` and
 * the URL. That way a refresh or the browser Back button from step 3 restores
 * not just the highlighted card but the tab it lives on, and the payment step
 * knows which purchase to make. A Back button returns to step 1 with the branch
 * preserved.
 */
export function StepPackage({
  gymId,
  locationId,
  initialPackageId,
  initialProductType,
  onSelect,
}: StepPackageProps) {
  const t = useTranslations('checkout');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [selectedId, setSelectedId] = useState<string | null>(initialPackageId ?? null);
  const [selectedType, setSelectedType] = useState<CheckoutProductType | null>(
    initialProductType ?? null,
  );
  const [tab, setTab] = useState<CheckoutProductType>(initialProductType ?? 'package');
  const [load, setLoad] = useState<LoadState>({ catalogue: null, status: 'loading' });

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
  // fills the gap; it runs once on mount. The type is restored with the id and
  // opens its tab, so the visitor lands back on the card they had chosen.
  useEffect(() => {
    if (initialPackageId) {
      return;
    }
    const storedId = window.sessionStorage.getItem(CHECKOUT_PACKAGE_KEY);
    if (!storedId) {
      return;
    }
    setSelectedId(storedId);

    const storedType = window.sessionStorage.getItem(CHECKOUT_PRODUCT_TYPE_KEY);
    if (storedType && (PRODUCT_TABS as readonly string[]).includes(storedType)) {
      setSelectedType(storedType as CheckoutProductType);
      setTab(storedType as CheckoutProductType);
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

  // Load the gym's catalogue; cancel the request if the step unmounts or the gym
  // changes. No gym in scope → nothing to load, settle as empty.
  useEffect(() => {
    if (!gymId) {
      setLoad({ catalogue: EMPTY_CATALOGUE, status: 'ready' });
      return;
    }

    const controller = new AbortController();
    setLoad((prev) => ({ catalogue: prev.catalogue, status: 'loading' }));

    fetchSignupCatalogue({ gymId, locationId: effectiveLocationId, signal: controller.signal })
      .then((catalogue) => setLoad({ catalogue, status: 'ready' }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setLoad({ catalogue: null, status: 'error' });
      });

    return () => controller.abort();
  }, [gymId, effectiveLocationId]);

  const catalogue = load.catalogue ?? EMPTY_CATALOGUE;
  const cards = useMemo(() => toCards(catalogue, tab), [catalogue, tab]);
  const counts = useMemo(
    () => ({
      package: catalogue.packages.length,
      subscription: catalogue.subscriptionPlans.length,
      credit_pack: catalogue.creditPacks.length,
    }),
    [catalogue],
  );
  /** Nothing on sale in any tab — distinct from "this tab happens to be empty". */
  const catalogueEmpty =
    counts.package === 0 && counts.subscription === 0 && counts.credit_pack === 0;

  const select = useCallback(
    (productId: string, productType: CheckoutProductType) => {
      setSelectedId(productId);
      setSelectedType(productType);
      window.sessionStorage.setItem(CHECKOUT_PACKAGE_KEY, productId);
      window.sessionStorage.setItem(CHECKOUT_PRODUCT_TYPE_KEY, productType);
      onSelect?.(productId, productType);
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
    if (!selectedId || !selectedType) {
      return;
    }
    const params = new URLSearchParams({
      step: '3',
      packageId: selectedId,
      productType: selectedType,
    });
    if (effectiveLocationId) {
      params.set('locationId', effectiveLocationId);
    }
    // Soft navigation (no full reload) so the wizard transitions in place.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [selectedId, selectedType, effectiveLocationId, pathname, router]);

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

  // Nothing on sale anywhere — the tabs would all be empty, so drop them and show
  // the step's empty state instead of three ways to see the same nothing.
  if (catalogueEmpty) {
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

      <div role="tablist" aria-label={t('packages.tabsLabel')} {...stylex.props(styles.tabs)}>
        {PRODUCT_TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`checkout-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`checkout-panel-${key}`}
            onClick={() => setTab(key)}
            {...stylex.props(styles.tab, tab === key ? styles.tabActive : styles.tabIdle)}
          >
            {t(`packages.tabs.${key}`)}
            <span {...stylex.props(styles.tabCount)}>{counts[key]}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`checkout-panel-${tab}`} aria-labelledby={`checkout-tab-${tab}`}>
        {cards.length === 0 ? (
          <p {...stylex.props(styles.tabEmpty)}>{t('packages.tabEmpty')}</p>
        ) : (
          <ul {...stylex.props(styles.grid)}>
            {cards.map((pkg) => (
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
                onSelect={() => select(pkg.id, tab)}
              />
            ))}
          </ul>
        )}
      </div>

      <div {...stylex.props(styles.actions)}>
        <Button variant="secondary" size="md" label={t('back')} onClick={onBack} />
        <Button
          variant="primary"
          size="md"
          label={t('continue')}
          isDisabled={!selectedId || !selectedType}
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
      createNumberFormat(locale, {
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
