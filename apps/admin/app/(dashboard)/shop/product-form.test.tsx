import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { ProductForm } from './product-form';
import { createProductAction, updateProductAction } from './actions';

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
  createProductAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 'p-1' } })),
  updateProductAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 'p-1' } })),
  createProductCategoryAction: vi.fn(),
  requestProductImageUploadAction: vi.fn(),
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

function createProduct(): void {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Water' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create product' }));
}

function renderEdit(): void {
  renderWithIntl(
    <ProductForm
      mode="edit"
      productId="p-1"
      categories={[]}
      initial={{
        name: 'Water',
        description: '',
        priceAmount: 250,
        costAmount: null,
        currency: 'GEL',
        images: [],
        variants: [],
        stock: null,
        lowStockThreshold: null,
        categoryId: null,
        locationId: 'loc-riverside',
      }}
    />,
  );
}

describe('ProductForm — branch exclusivity', () => {
  afterEach(() => {
    vi.clearAllMocks();
    activeLocation.locationId = undefined;
  });

  it('starts empty on create even when the header is scoped to a branch, and sends null', async () => {
    // Seeding the switcher's branch would make every new product exclusive to
    // whichever branch the operator happened to be looking at.
    activeLocation.locationId = 'loc-downtown';
    renderWithIntl(<ProductForm mode="create" categories={[]} />);

    expect(branchSelect().value).toBe('');
    createProduct();
    await waitFor(() => expect(createProductAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createProductAction).mock.calls[0]![0].locationId).toBeNull();
  });

  it('sends the branch picked in the select', async () => {
    renderWithIntl(<ProductForm mode="create" categories={[]} />);

    fireEvent.change(branchSelect(), { target: { value: 'loc-riverside' } });
    createProduct();
    await waitFor(() => expect(createProductAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createProductAction).mock.calls[0]![0].locationId).toBe('loc-riverside');
  });

  it('shows the stored branch on edit and saves it back', async () => {
    activeLocation.locationId = 'loc-downtown';
    renderEdit();

    expect(branchSelect().value).toBe('loc-riverside');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateProductAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateProductAction).mock.calls[0]![1].locationId).toBe('loc-riverside');
  });

  it('sends null, not an empty string, when an edit widens the product to every branch', async () => {
    renderEdit();

    fireEvent.change(branchSelect(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateProductAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateProductAction).mock.calls[0]![1].locationId).toBeNull();
  });
});
