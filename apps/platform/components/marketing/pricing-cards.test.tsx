import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeadCtaProvider } from './lead-cta-provider';
import { PricingCards, tiers } from './pricing-cards';
import { SHOW_PUBLIC_PRICING } from '@/lib/pricing-visibility';

/** The grid inside the provider that owns the site's two lead forms. */
const renderCards = () =>
  render(
    <LeadCtaProvider>
      <PricingCards />
    </LeadCtaProvider>,
  );

/**
 * The plan grid with prices withheld. What matters here is the split: the plans
 * themselves are on show, the figures are not, and both calls to action are one
 * click away from every card.
 */
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

  it('closes every card with the two calls to action, under the feature list', () => {
    renderCards();

    for (const tier of tiers) {
      // The h2 is a direct child of the card body, so its parent is the card.
      const card = screen.getByRole('heading', { name: tier.name }).parentElement!;
      const features = within(card).getByRole('list');
      const footer = card.lastElementChild!;

      expect(footer).toContainElement(within(card).getByRole('button', { name: 'Book a demo' }));
      expect(footer).toContainElement(within(card).getByRole('button', { name: 'Request a call' }));
      expect(features.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  it('offers no other call to action', () => {
    renderCards();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(tiers.length * 2);
  });

  it('prints no figure, currency or billing period', () => {
    // The flag is the product decision under test; if it is flipped back on the
    // prices are meant to return, so assert the state this suite describes.
    expect(SHOW_PUBLIC_PRICING).toBe(false);

    const { container } = renderCards();

    expect(container.textContent).not.toMatch(/₾|\/mo/);
    for (const tier of tiers) {
      expect(container.textContent).not.toContain(String(tier.monthly));
    }
  });

  it('opens the demo form from a card', async () => {
    const user = userEvent.setup();
    renderCards();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Book a demo' })[0]!);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('What would you like to see?')).toBeInTheDocument();
  });

  it('sends a call request from a card as a call lead', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'lead-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderCards();

    await user.click(screen.getAllByRole('button', { name: 'Request a call' })[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Full name'), 'Giorgi');
    await user.type(within(dialog).getByLabelText('Phone'), '+995 555 12 34 56');
    await user.type(within(dialog).getByLabelText('Work email'), 'giorgi@gym.ge');
    await user.click(within(dialog).getByRole('button', { name: 'Request a call' }));

    expect(await screen.findByText(/will call you back shortly/i)).toBeVisible();
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('/api/leads');
    expect(JSON.parse(init.body as string)).toMatchObject({
      type: 'call',
      name: 'Giorgi',
      phone: '+995 555 12 34 56',
      email: 'giorgi@gym.ge',
    });
    vi.unstubAllGlobals();
  });
});
