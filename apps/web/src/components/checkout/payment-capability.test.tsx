import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnlinePaymentsProvider } from './online-payments';
import { BuyCreditsCard } from '@/app/[locale]/member/(member)/account/membership/buy-credits-card';
import { ChangePlanButton } from '@/app/[locale]/member/(member)/account/membership/change-plan-modal';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }));
vi.mock('@/src/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock('@/app/actions/credit-packs', () => ({ purchaseCreditPackAction: vi.fn() }));
vi.mock('@/lib/signup', () => ({ createCheckout: vi.fn(), fetchSignupCatalogue: vi.fn(), CheckoutError: class extends Error {} }));
const catalogue = [{ id: 'pack', name: 'Ten credits', priceAmount: 1000, currency: 'GEL', sessionCount: 10, validityDays: null }];

it('hides credit-pack and subscription purchase buttons when payments are disabled', () => {
  render(<OnlinePaymentsProvider value={{ enabled: false, provider: null }}>
    <BuyCreditsCard credits={3} catalogue={catalogue} />
    <ChangePlanButton gymId="gym" currentPlanId={null} hasMembership={false} />
  </OnlinePaymentsProvider>);
  expect(screen.queryByRole('button', { name: 'buyMore' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'choosePlan' })).toBeNull();
  expect(screen.getAllByText('unavailable')).toHaveLength(2);
});
it('retains purchase entry points when a provider is enabled', () => {
  render(<OnlinePaymentsProvider value={{ enabled: true, provider: 'flitt' }}>
    <BuyCreditsCard credits={3} catalogue={catalogue} />
    <ChangePlanButton gymId="gym" currentPlanId={null} hasMembership={false} />
  </OnlinePaymentsProvider>);
  expect(screen.getByRole('button', { name: 'buyMore' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'choosePlan' })).toBeEnabled();
});
