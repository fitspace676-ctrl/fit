import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { checkoutProductTypeSchema, type CheckoutProductType } from '@fit/types';
import { getActiveGymId } from '@/lib/active-gym';
import { fetchSignupCatalogue } from '@/lib/signup';
import { OrderSummary, type OrderSummaryProduct } from '@/src/components/checkout/OrderSummary';
import { toCards } from '@/src/components/checkout/product-cards';
import { StepDetails } from '@/src/components/checkout/StepDetails';
import { StepLocation } from '@/src/components/checkout/StepLocation';
import { StepPackage } from '@/src/components/checkout/StepPackage';
import { StepPayment } from '@/src/components/checkout/StepPayment';
import { WizardShell, type WizardStep } from '@/src/components/checkout/WizardShell';

export const metadata: Metadata = {
  title: 'Checkout — Fit',
  description: 'Choose a location and buy your membership.',
};

/**
 * Render per request, never at build: the active gym is resolved from the
 * request `Host` (`getActiveGymId` → `headers()`), so a prerendered shell would
 * bake in a null gym and show the empty state on every tenant subdomain.
 */
export const dynamic = 'force-dynamic';

// Astryx migration (T11.15): the purchase-wizard page frame + header are authored
// in compiled StyleX over the Fit brand theme tokens (`var(--color-*)` /
// `var(--font-family-*)`) — no Tailwind utilities. Step routing is unchanged.
const styles = stylex.create({
  page: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '64rem',
    paddingInline: '1.25rem',
    paddingBlock: '2.5rem',
  },
  /**
   * The wizard beside its running summary. One column on narrow viewports (the
   * summary rides above the step, where a sticky rail would eat the screen);
   * from 64rem the summary becomes a sticky rail the buyer keeps in view while
   * they work through the form.
   */
  layout: {
    display: 'grid',
    alignItems: 'start',
    gap: '2rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 64rem)': 'minmax(0, 1fr) 19rem',
    },
  },
  /** Summary first in the source, second on the grid — see the page docstring. */
  summaryCol: {
    order: {
      default: -1,
      '@media (min-width: 64rem)': 0,
    },
  },
  header: {
    marginBottom: '2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/** Raw search params the checkout page reads (all optional strings). */
interface CheckoutSearchParams {
  step?: string;
  locationId?: string;
  packageId?: string;
  productType?: string;
}

/**
 * Coerce the `?productType` param to a known catalogue, or `undefined`. The id
 * in `?packageId` is meaningless without it — packages, subscriptions and credit
 * packs are three different tables — so an unrecognised value is dropped rather
 * than guessed at, and the step falls back to what it persisted.
 */
function parseProductType(raw: string | undefined): CheckoutProductType | undefined {
  const parsed = checkoutProductTypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** What the running summary needs: the chosen branch and product, named and priced. */
interface ResolvedSelection {
  locationName: string | null;
  product: OrderSummaryProduct | null;
}

/**
 * Resolve the URL's ids to the display copy the summary shows.
 *
 * Reads the same public catalogue the steps do, so the summary can never name a
 * different product than the one the payment step will charge for. Skipped
 * entirely on step 1, where nothing has been chosen and the fetch would be
 * wasted; and every failure degrades to "nothing selected yet" rather than
 * breaking the wizard — a summary is an aid, never a gate.
 */
async function resolveSelection({
  gymId,
  locationId,
  productId,
  productType,
  t,
}: {
  gymId: string | null;
  locationId?: string;
  productId?: string;
  productType?: CheckoutProductType;
  t: Awaited<ReturnType<typeof getTranslations<'checkout'>>>;
}): Promise<ResolvedSelection> {
  const empty: ResolvedSelection = { locationName: null, product: null };
  if (!gymId || (!locationId && !productId)) {
    return empty;
  }

  const catalogue = await fetchSignupCatalogue({ gymId, locationId }).catch(() => null);
  if (!catalogue) {
    return empty;
  }

  const locationName = locationId
    ? (catalogue.locations.find((l) => l.id === locationId)?.name ?? null)
    : null;

  if (!productId || !productType) {
    return { locationName, product: null };
  }

  // Project through the same mapping step 2's cards use, so the summary and the
  // card the buyer clicked always read identically.
  const card = toCards(catalogue, productType).find((entry) => entry.id === productId);
  if (!card) {
    return { locationName, product: null };
  }

  return {
    locationName,
    product: {
      name: card.name,
      priceAmount: card.priceAmount,
      currency: card.currency,
      type: productType,
      cadence:
        card.interval === 'month'
          ? t('packages.perMonth')
          : card.interval === 'year'
            ? t('packages.perYear')
            : null,
    },
  };
}

/** Coerce the `?step` param to a valid 1-based wizard step, defaulting to 1. */
function parseStep(raw: string | undefined): WizardStep {
  const value = Number(raw);
  if (value === 2 || value === 3 || value === 4) {
    return value;
  }
  return 1;
}

/**
 * Public purchase wizard. A Server Component that resolves the active gym and the
 * current step from the URL, then renders the matching step inside the
 * {@link WizardShell} progress chrome. Each step ({@link StepLocation},
 * {@link StepPackage}, {@link StepDetails}, {@link StepPayment}) is a client
 * island that owns its own fetch, selection, and navigation. Reachable
 * signed-out — the auth gate is the final payment step, not the browse.
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CheckoutSearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const [t, gymId] = await Promise.all([getTranslations('checkout'), getActiveGymId()]);

  const step = parseStep(sp.step);
  const productType = parseProductType(sp.productType);
  const selection = await resolveSelection({
    gymId,
    locationId: sp.locationId,
    productId: sp.packageId,
    productType,
    t,
  });

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </header>

      <div {...stylex.props(styles.layout)}>
        <WizardShell step={step}>
          {step === 1 ? (
            <StepLocation gymId={gymId} initialLocationId={sp.locationId} />
          ) : step === 2 ? (
            <StepPackage
              gymId={gymId}
              locationId={sp.locationId}
              initialPackageId={sp.packageId}
              initialProductType={productType}
            />
          ) : step === 3 ? (
            <StepDetails
              gymId={gymId}
              locationId={sp.locationId}
              packageId={sp.packageId}
              productType={productType}
            />
          ) : (
            <StepPayment
              gymId={gymId}
              locationId={sp.locationId}
              packageId={sp.packageId}
              productType={productType}
            />
          )}
        </WizardShell>

        <div {...stylex.props(styles.summaryCol)}>
          <OrderSummary
            locale={locale}
            locationName={selection.locationName}
            product={selection.product}
          />
        </div>
      </div>
    </div>
  );
}
