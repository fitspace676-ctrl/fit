import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import type { ProductSummary } from '@fit/types';

const addToCartAction = vi.fn<(variantRef: string, qty: number) => Promise<unknown>>();
vi.mock('@/app/actions/cart', () => ({
  addToCartAction: (variantRef: string, qty: number) => addToCartAction(variantRef, qty),
  removeCartItemAction: vi.fn(),
  updateCartItemAction: vi.fn(),
}));
vi.mock('@/src/components/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useToast: () => ({ toast: vi.fn() }),
}));

const { ProductRow } = await import('./ProductRow');

const tee: ProductSummary = {
  id: 'tee',
  name: 'Training Tee',
  description: '',
  priceAmount: 4500,
  currency: 'GEL',
  imageUrl: null,
  variants: [
    { id: '0', name: 'S', priceAmount: 4500, available: false },
    { id: '1', name: 'M', priceAmount: 4500, available: true },
    { id: '2', name: 'XL', priceAmount: 5200, available: true },
  ],
};

function renderRow(product: ProductSummary, unitsOf: (ref: string) => number = () => 0) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ProductRow product={product} unitsOf={unitsOf} onCart={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

const options = () => within(screen.getByRole('radiogroup', { name: 'Choose an option' }));

beforeEach(() => {
  addToCartAction.mockReset();
  addToCartAction.mockResolvedValue({ ok: true, cart: { items: [] } });
});

describe('the shop row with variants', () => {
  it('lists every variant, starting on the first one in stock', () => {
    renderRow(tee);
    expect(
      options()
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['S', 'M', 'XL']);
    expect(options().getByRole('radio', { name: 'S' })).toBeDisabled();
    expect(options().getByRole('radio', { name: 'M' })).toHaveAttribute('aria-checked', 'true');
  });

  it('adds the chosen variant, at its own price', async () => {
    renderRow(tee);
    fireEvent.click(options().getByRole('radio', { name: 'XL' }));
    expect(screen.getByText(/52/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addToCartAction).toHaveBeenCalledWith('tee:2', 1));
  });

  it('shows the quantity of the chosen variant only', () => {
    renderRow(tee, (ref) => (ref === 'tee:1' ? 3 : 0));
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(options().getByRole('radio', { name: 'XL' }));
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('buys a product without variants at its base price', async () => {
    renderRow({ ...tee, variants: [] });
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addToCartAction).toHaveBeenCalledWith('tee:base', 1));
  });
});
