import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { ClassTypeForm, type ClassTypeInitial } from './class-type-form';
import { createClassTypeAction, updateClassTypeAction } from './class-type-actions';

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
vi.mock('./class-type-actions', () => ({
  createClassTypeAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 'ct-1' } })),
  updateClassTypeAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 'ct-1' } })),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const existing: ClassTypeInitial = {
  name: 'Boxing',
  description: '',
  durationMinutes: 60,
  capacity: 20,
  minAttendance: null,
  color: '#ef4444',
  pricingRule: 'FREE',
  priceMinor: null,
  includedPlanIds: [],
  status: 'ACTIVE',
  locationId: 'loc-riverside',
};

function branchSelect(): HTMLSelectElement {
  return screen.getByLabelText<HTMLSelectElement>('Branch');
}

function createType(): void {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Boxing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add class type' }));
}

describe('ClassTypeForm — branch exclusivity', () => {
  afterEach(() => {
    vi.clearAllMocks();
    activeLocation.locationId = undefined;
  });

  it('starts empty on create even when the header is scoped to a branch, and sends null', async () => {
    // Seeding the switcher's branch would make every new type exclusive to
    // whichever branch the operator happened to be looking at.
    activeLocation.locationId = 'loc-downtown';
    renderWithIntl(<ClassTypeForm mode="create" plans={[]} />);

    expect(branchSelect().value).toBe('');
    createType();
    await waitFor(() => expect(createClassTypeAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createClassTypeAction).mock.calls[0]![0].locationId).toBeNull();
  });

  it('sends the branch picked in the select', async () => {
    renderWithIntl(<ClassTypeForm mode="create" plans={[]} />);

    fireEvent.change(branchSelect(), { target: { value: 'loc-riverside' } });
    createType();
    await waitFor(() => expect(createClassTypeAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createClassTypeAction).mock.calls[0]![0].locationId).toBe('loc-riverside');
  });

  it('shows the stored branch on edit and saves it back', async () => {
    activeLocation.locationId = 'loc-downtown';
    renderWithIntl(<ClassTypeForm mode="edit" typeId="ct-1" initial={existing} plans={[]} />);

    expect(branchSelect().value).toBe('loc-riverside');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateClassTypeAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateClassTypeAction).mock.calls[0]![1].locationId).toBe('loc-riverside');
  });

  it('sends null, not an empty string, when an edit widens the type to every branch', async () => {
    renderWithIntl(<ClassTypeForm mode="edit" typeId="ct-1" initial={existing} plans={[]} />);

    fireEvent.change(branchSelect(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateClassTypeAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateClassTypeAction).mock.calls[0]![1].locationId).toBeNull();
  });
});
