import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import type { PromoCodeRow } from '@fit/types';
import { PromoFormDialog } from './promo-form-dialog';
import { createPromoAction, updatePromoAction } from './actions';

/**
 * The console's active branch, as the top-bar switcher reports it. Hoisted so the
 * `vi.mock` factory below can close over it.
 */
const activeLocation = vi.hoisted(() => ({ locationId: undefined as string | undefined }));

vi.mock('@/components/active-location', () => ({
  useActiveLocation: () => ({
    active: activeLocation.locationId ?? 'all',
    locationId: activeLocation.locationId,
    locations: [
      { id: 'loc-riverside', name: 'Riverside' },
      { id: 'loc-downtown', name: 'Downtown' },
    ],
    canSelectAll: true,
    setActive: vi.fn(),
  }),
}));
vi.mock('./actions', () => ({
  createPromoAction: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
  updatePromoAction: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
}));
vi.mock('@/components/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const promo = en.admin.marketing.promo;

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const existing: PromoCodeRow = {
  id: 'promo-1',
  code: 'SUMMER10',
  description: '',
  discountType: 'percentage',
  discountValue: 10,
  minPurchase: null,
  usageLimit: null,
  usedCount: 0,
  appliesTo: 'all',
  startsAt: null,
  expiryDate: null,
  oncePerMember: false,
  status: 'active',
  locationId: 'loc-riverside',
  locationName: 'Riverside',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function branchSelect(): HTMLSelectElement {
  return screen.getByLabelText<HTMLSelectElement>('Branch');
}

function createCode(): void {
  fireEvent.change(screen.getByLabelText(promo.codeLabel), { target: { value: 'SUMMER10' } });
  fireEvent.change(screen.getByLabelText(promo.discountValuePercent), {
    target: { value: '10' },
  });
  fireEvent.click(screen.getByRole('button', { name: promo.addSubmit }));
}

describe('PromoFormDialog — branch exclusivity', () => {
  afterEach(() => {
    vi.clearAllMocks();
    activeLocation.locationId = undefined;
  });

  it('starts empty on create even when the header is scoped to a branch, and sends null', async () => {
    // Seeding the switcher's branch would make every new code redeemable only at
    // whichever branch the operator happened to be looking at.
    activeLocation.locationId = 'loc-downtown';
    renderWithIntl(<PromoFormDialog mode="create" onClose={vi.fn()} />);

    expect(branchSelect().value).toBe('');
    createCode();
    await waitFor(() => expect(createPromoAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPromoAction).mock.calls[0]![0].locationId).toBeNull();
  });

  it('sends the branch picked in the select', async () => {
    renderWithIntl(<PromoFormDialog mode="create" onClose={vi.fn()} />);

    fireEvent.change(branchSelect(), { target: { value: 'loc-riverside' } });
    createCode();
    await waitFor(() => expect(createPromoAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPromoAction).mock.calls[0]![0].locationId).toBe('loc-riverside');
  });

  it('shows the stored branch on edit and saves it back', async () => {
    activeLocation.locationId = 'loc-downtown';
    renderWithIntl(<PromoFormDialog mode="edit" seed={existing} onClose={vi.fn()} />);

    expect(branchSelect().value).toBe('loc-riverside');
    fireEvent.click(screen.getByRole('button', { name: promo.editSubmit }));
    await waitFor(() => expect(updatePromoAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updatePromoAction).mock.calls[0]![1].locationId).toBe('loc-riverside');
  });

  it('sends null, not an empty string, when an edit widens the code to every branch', async () => {
    renderWithIntl(<PromoFormDialog mode="edit" seed={existing} onClose={vi.fn()} />);

    fireEvent.change(branchSelect(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: promo.editSubmit }));
    await waitFor(() => expect(updatePromoAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updatePromoAction).mock.calls[0]![1].locationId).toBeNull();
  });
});
