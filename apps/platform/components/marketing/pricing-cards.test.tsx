import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PricingCards, tiers } from './pricing-cards';
import { SHOW_PUBLIC_PRICING } from '@/lib/pricing-visibility';

/**
 * The plan grid with prices withheld. What matters here is the split: the plans
 * themselves are on show, the figures are not, and the quote form is one click
 * away from every card.
 */
describe('PricingCards', () => {
  it('shows every plan, with its badge, tagline and features', () => {
    render(<PricingCards />);

    for (const tier of tiers) {
      expect(screen.getByRole('heading', { name: tier.name })).toBeInTheDocument();
      expect(screen.getByText(tier.tagline)).toBeInTheDocument();
      for (const feature of tier.features) {
        expect(screen.getByText(feature)).toBeInTheDocument();
      }
    }
    expect(screen.getByText('Most popular')).toBeInTheDocument();
  });

  it('keeps each tier CTA', () => {
    render(<PricingCards />);

    expect(screen.getAllByRole('link', { name: /Start free trial/ })).toHaveLength(tiers.length);
  });

  it('closes every card with its buttons, under the feature list', () => {
    render(<PricingCards />);

    for (const tier of tiers) {
      // The h2 is a direct child of the card body, so its parent is the card.
      const card = screen.getByRole('heading', { name: tier.name }).parentElement!;
      const features = within(card).getByRole('list');
      const footer = card.lastElementChild!;

      expect(footer).toContainElement(within(card).getByRole('link', { name: /Start free trial/ }));
      expect(footer).toContainElement(
        within(card).getByRole('button', { name: 'Request pricing' }),
      );
      expect(features.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  it('prints no figure, currency or billing period', () => {
    // The flag is the product decision under test; if it is flipped back on the
    // prices are meant to return, so assert the state this suite describes.
    expect(SHOW_PUBLIC_PRICING).toBe(false);

    const { container } = render(<PricingCards />);

    expect(container.textContent).not.toMatch(/₾|\/mo/);
    for (const tier of tiers) {
      expect(container.textContent).not.toContain(String(tier.monthly));
    }
  });

  it('offers a pricing request on every card', () => {
    render(<PricingCards />);

    expect(screen.getAllByRole('button', { name: 'Request pricing' })).toHaveLength(tiers.length);
  });

  it('opens the request form when a card asks for pricing', async () => {
    const user = userEvent.setup();
    render(<PricingCards />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Request pricing' })[0]!);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Full name')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Work email')).toBeInTheDocument();
  });

  it('sends the quote request as a pricing lead', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'lead-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<PricingCards />);

    await user.click(screen.getAllByRole('button', { name: 'Request pricing' })[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Full name'), 'Giorgi');
    await user.type(within(dialog).getByLabelText('Work email'), 'giorgi@gym.ge');
    await user.click(within(dialog).getByRole('button', { name: 'Request pricing' }));

    expect(await screen.findByText(/get back to you shortly with pricing/i)).toBeVisible();
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/leads');
    expect(JSON.parse(init.body as string)).toMatchObject({ type: 'pricing', name: 'Giorgi' });
    vi.unstubAllGlobals();
  });
});
