import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { PackagePlanForm } from './package-plan-form';
import { createPackagePlanAction, updatePackagePlanAction } from './actions';

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
  createPackagePlanAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 'pk-1' } })),
  updatePackagePlanAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 'pk-1' } })),
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
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: '10 Session Pack' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
}

function renderEdit(): void {
  renderWithIntl(
    <PackagePlanForm
      mode="edit"
      planId="pk-1"
      initial={{
        name: '10 Session Pack',
        description: '',
        priceAmount: 30000,
        currency: 'GEL',
        billingInterval: 'MONTH',
        sessionCount: 10,
        features: [],
        popular: false,
        locationId: 'loc-riverside',
      }}
    />,
  );
}

describe('PackagePlanForm — branch exclusivity', () => {
  afterEach(() => {
    vi.clearAllMocks();
    activeLocation.locationId = undefined;
  });

  it('starts empty on create even when the header is scoped to a branch, and sends null', async () => {
    // Seeding the switcher's branch would make every new package exclusive to
    // whichever branch the operator happened to be looking at.
    activeLocation.locationId = 'loc-downtown';
    renderWithIntl(<PackagePlanForm mode="create" />);

    expect(branchSelect().value).toBe('');
    createPlan();
    await waitFor(() => expect(createPackagePlanAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPackagePlanAction).mock.calls[0]![0].locationId).toBeNull();
  });

  it('sends the branch picked in the select', async () => {
    renderWithIntl(<PackagePlanForm mode="create" />);

    fireEvent.change(branchSelect(), { target: { value: 'loc-riverside' } });
    createPlan();
    await waitFor(() => expect(createPackagePlanAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPackagePlanAction).mock.calls[0]![0].locationId).toBe('loc-riverside');
  });

  it('shows the stored branch on edit and saves it back', async () => {
    activeLocation.locationId = 'loc-downtown';
    renderEdit();

    expect(branchSelect().value).toBe('loc-riverside');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updatePackagePlanAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updatePackagePlanAction).mock.calls[0]![1].locationId).toBe('loc-riverside');
  });

  it('sends null, not an empty string, when an edit widens the package to every branch', async () => {
    renderEdit();

    fireEvent.change(branchSelect(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updatePackagePlanAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updatePackagePlanAction).mock.calls[0]![1].locationId).toBeNull();
  });
});
