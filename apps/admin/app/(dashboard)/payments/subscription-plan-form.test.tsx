import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { SubscriptionPlanForm } from './subscription-plan-form';
import { createSubscriptionPlanAction, updateSubscriptionPlanAction } from './actions';

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
  createSubscriptionPlanAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 'sp-1' } })),
  updateSubscriptionPlanAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 'sp-1' } })),
  setPlanClassTypesAction: vi.fn(() => Promise.resolve({ ok: true, data: undefined })),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function branchSelect(): HTMLSelectElement {
  return screen.getByLabelText<HTMLSelectElement>('Branch');
}

function createPlan(): void {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Monthly Unlimited' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
}

function renderEdit(): void {
  renderWithIntl(
    <SubscriptionPlanForm
      mode="edit"
      planId="sp-1"
      classTypes={[]}
      initial={{
        name: 'Monthly Unlimited',
        description: '',
        priceAmount: 9000,
        currency: 'GEL',
        interval: 'MONTH',
        features: [],
        popular: false,
        freezeDaysPerPeriod: 30,
        includedCredits: 0,
        trialDays: 0,
        locationId: 'loc-riverside',
      }}
    />,
  );
}

describe('SubscriptionPlanForm — branch exclusivity', () => {
  afterEach(() => {
    vi.clearAllMocks();
    activeLocation.locationId = undefined;
  });

  it('starts empty on create even when the header is scoped to a branch, and sends null', async () => {
    // Seeding the switcher's branch would make every new plan exclusive to
    // whichever branch the operator happened to be looking at.
    activeLocation.locationId = 'loc-downtown';
    renderWithIntl(<SubscriptionPlanForm mode="create" classTypes={[]} />);

    expect(branchSelect().value).toBe('');
    createPlan();
    await waitFor(() => expect(createSubscriptionPlanAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createSubscriptionPlanAction).mock.calls[0]![0].locationId).toBeNull();
  });

  it('sends the branch picked in the select', async () => {
    renderWithIntl(<SubscriptionPlanForm mode="create" classTypes={[]} />);

    fireEvent.change(branchSelect(), { target: { value: 'loc-riverside' } });
    createPlan();
    await waitFor(() => expect(createSubscriptionPlanAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createSubscriptionPlanAction).mock.calls[0]![0].locationId).toBe(
      'loc-riverside',
    );
  });

  it('shows the stored branch on edit and saves it back', async () => {
    activeLocation.locationId = 'loc-downtown';
    renderEdit();

    expect(branchSelect().value).toBe('loc-riverside');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateSubscriptionPlanAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateSubscriptionPlanAction).mock.calls[0]![1].locationId).toBe(
      'loc-riverside',
    );
  });

  it('sends null, not an empty string, when an edit widens the plan to every branch', async () => {
    renderEdit();

    fireEvent.change(branchSelect(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateSubscriptionPlanAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateSubscriptionPlanAction).mock.calls[0]![1].locationId).toBeNull();
  });
});
