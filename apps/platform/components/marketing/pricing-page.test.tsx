import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl as render } from '@/test/render-with-intl';
import { LeadCtaProvider } from './lead-cta-provider';
import PricingPage from './pricing-page';
import type * as MarketingUi from './marketing-ui';

// Keep these tests focused on the pricing content and its real lead forms.
vi.mock('./marketing-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof MarketingUi>()),
  MarketingNav: () => null,
  MarketingFooter: () => null,
}));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});
afterEach(() => vi.unstubAllGlobals());

const renderPage = () =>
  render(
    <LeadCtaProvider>
      <PricingPage />
    </LeadCtaProvider>,
  );

describe('PricingPage', () => {
  it('shows the new hero, seven comparison groups, six steps and onboarding footnote', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Plans built to keep your members coming back',
    );
    expect(screen.getByText('Built For The Businesses That Move People.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Every plan includes guided onboarding and support for your team. Each plan includes everything in the one before it.',
      ),
    ).toBeInTheDocument();
    const table = screen.getByRole('table');
    const groups = table.querySelectorAll('td[colspan="4"]');
    expect(Array.from(groups, (cell) => cell.textContent)).toEqual([
      'Operations',
      'Member Experience',
      'Check-in & Access Control',
      'Retention & Automation',
      'Reporting & Intelligence',
      'Integrations & Control',
      'Onboarding & Support',
    ]);
    expect(within(table).getAllByRole('row')).toHaveLength(36);
    for (const [label, included] of [
      ['AI Assistant', [false, true, true]],
      ['Priority Support', [false, false, true]],
      ['Manual Check-in', [true, true, true]],
      ['Multi-location Management', [false, false, true]],
    ] as const) {
      const row = within(table).getByText(label).closest('tr')!;
      expect(
        Array.from(row.querySelectorAll('td'))
          .slice(1)
          .map((cell) => Boolean(cell.querySelector('.animated-check'))),
      ).toEqual(included);
    }
    const timeline = screen
      .getByRole('heading', { name: 'From first conversation to fully live.' })
      .closest('section')!;
    expect(
      within(timeline)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Book a Meeting',
      'Demo',
      'Contract and Setup',
      'Data Migration',
      'Onboarding Call',
      'Go Live',
    ]);
  });

  it.each(['Book a demo', 'Request a call'])(
    'opens the %s form from the final CTA',
    async (name) => {
      const user = userEvent.setup();
      renderPage();
      const cta = screen
        .getByRole('heading', { name: 'See FormaCore with your business in mind.' })
        .closest('section')!;
      await user.click(within(cta).getByRole('button', { name }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('heading', { name })).toBeInTheDocument();
      expect(
        within(dialog).getByRole('button', {
          name: name === 'Book a demo' ? 'Request demo' : 'Request a call',
        }),
      ).toBeInTheDocument();
    },
  );
});
