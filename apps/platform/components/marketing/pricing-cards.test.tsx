import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { enTranslator, renderWithIntl } from '@/test/render-with-intl';
import { LeadCtaProvider } from './lead-cta-provider';
import { PricingCards, getTiers } from './pricing-cards';
import { SHOW_PUBLIC_PRICING } from '@/lib/pricing-visibility';

/** The tiers as the English site builds them. */
const tiers = getTiers(enTranslator('pricing'));

/** The grid inside the provider that owns the site's two lead forms. */
const renderCards = () =>
  renderWithIntl(
    <LeadCtaProvider>
      <PricingCards />
    </LeadCtaProvider>,
  );

describe('PricingCards', () => {
  it('shows every plan, with its badge, tagline and features', () => {
    renderCards();

    for (const tier of tiers) {
      expect(screen.getByRole('heading', { name: tier.name })).toBeInTheDocument();
      expect(screen.getByText(tier.tagline)).toBeInTheDocument();
      for (const feature of tier.features) {
        expect(screen.getByText(feature)).toBeInTheDocument();
      }
    }
    expect(screen.getByText('Most popular')).toBeInTheDocument();
  });

  it('closes every card with only Book a demo, under the feature list', () => {
    renderCards();

    for (const tier of tiers) {
      // The h2 sits in the card's header row (beside the badge), so the card is its grandparent.
      const card = screen.getByRole('heading', { name: tier.name }).parentElement!.parentElement!;
      const features = within(card).getByRole('list');
      const footer = card.lastElementChild!;

      expect(footer).toContainElement(within(card).getByRole('button', { name: 'Book a demo' }));
      expect(
        within(card).queryByRole('button', { name: 'Request a call' }),
      ).not.toBeInTheDocument();
      expect(features.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  it('offers no other call to action', () => {
    renderCards();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(tiers.length);
  });

  it('shows the monthly GEL prices and only prefixes Core with from', () => {
    expect(SHOW_PUBLIC_PRICING).toBe(true);
    renderCards();

    for (const [name, price, prefix, billing] of [
      ['Studio', '₾219', false, 'billed monthly'],
      ['Club', '₾449', false, 'billed monthly'],
      ['Core', '₾649', true, 'billed monthly ·'],
    ] as const) {
      const card = screen.getByRole('heading', { name }).parentElement!.parentElement!;
      expect(within(card).getByText(price)).toBeVisible();
      expect(within(card).getByText('/ month')).toBeVisible();
      expect(within(card).getByText(billing)).toBeVisible();
      expect(Boolean(within(card).queryByText('from'))).toBe(prefix);
    }
    expect(screen.queryByText(/cancel any time/i)).not.toBeInTheDocument();
  });

  it('opens the demo form from a card', async () => {
    const user = userEvent.setup();
    renderCards();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Book a demo' })[0]!);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Active members')).toBeInTheDocument();
  });
});
