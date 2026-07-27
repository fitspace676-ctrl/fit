import type { CheckoutProductType, PackageSummary, SignupCatalogueResponse } from '@fit/types';

/**
 * The three tabs of the product step, in render order. Each maps to one
 * catalogue in the `GET /catalogue` response.
 */
export const PRODUCT_TABS: readonly CheckoutProductType[] = [
  'package',
  'subscription',
  'credit_pack',
];

/**
 * Flatten one catalogue into the card view model.
 *
 * All three products render as the same card, so subscriptions and credit packs
 * are projected onto {@link PackageSummary} rather than given near-identical
 * components of their own: a subscription's cadence becomes the price suffix,
 * and a credit pack's session count becomes the "N sessions" line the card
 * already knows how to show.
 *
 * Deliberately framework-free and **not** in a `'use client'` module: the
 * product step renders these cards on the client, while the wizard's running
 * summary resolves the chosen one on the server. Both must project a catalogue
 * row the same way — otherwise the summary could name the product differently
 * from the card the buyer clicked — so the mapping lives here, importable from
 * either side.
 */
export function toCards(
  catalogue: SignupCatalogueResponse,
  tab: CheckoutProductType,
): readonly PackageSummary[] {
  switch (tab) {
    case 'package':
      return catalogue.packages;
    case 'subscription':
      return catalogue.subscriptionPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceAmount: plan.priceAmount,
        currency: plan.currency,
        interval: plan.interval === 'YEAR' ? 'year' : 'month',
        // A recurring membership entitles the member to every class rather than a
        // countable number of them, which is exactly what the card's `null` means.
        sessionCount: null,
        features: plan.features,
        popular: plan.popular,
      }));
    case 'credit_pack':
      return catalogue.creditPacks.map((pack) => ({
        id: pack.id,
        name: pack.name,
        description: '',
        priceAmount: pack.priceAmount,
        currency: pack.currency,
        // A pack is bought outright, so it carries no recurring price suffix.
        interval: 'one_time',
        sessionCount: pack.sessionCount,
        features: [],
        popular: false,
      }));
  }
}
