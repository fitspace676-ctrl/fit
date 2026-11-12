import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { CartView, ProductSummary } from '@fit/types';
import en from '@fit/i18n/locales/en.json';
import { addToCartAction, removeCartItemAction, updateCartItemAction } from '@/app/actions/cart';
import { ProductList } from './ProductList';
import { formatMoney } from '@/lib/shop';

vi.mock('@/app/actions/cart', () => ({
  addToCartAction: vi.fn(),
  removeCartItemAction: vi.fn(),
  updateCartItemAction: vi.fn(),
}));
vi.mock('@/src/components/ui', () => ({ Icon: () => null, useToast: () => ({ toast: vi.fn() }) }));

const product: ProductSummary = {
  id: 'tee',
  name: 'Training tee',
  description: '',
  priceAmount: 1000,
  currency: 'GEL',
  imageUrl: null,
  variants: [
    { id: '0', name: 'S', priceAmount: 2000, available: false },
    { id: '1', name: 'M', priceAmount: 3000, available: true },
    { id: '2', name: 'L', priceAmount: 4000, available: true },
  ],
};
const empty: CartView = { items: [], subtotal: 0, discount: 0, total: 0, currency: 'GEL' };
function cart(...lines: [string, number][]): CartView {
  const items = lines.map(([id, qty]) => {
    const option = product.variants.find((v) => v.id === id)!;
    return {
      variantId: `tee:${id}`,
      productId: 'tee',
      productName: product.name,
      variantName: option.name,
      imageUrl: null,
      unitPrice: option.priceAmount,
      qty,
      lineTotal: option.priceAmount * qty,
      currency: 'GEL',
      available: true,
    };
  });
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return { ...empty, items, total, subtotal: total };
}
function Shop({ initial = empty, item = product }: { initial?: CartView; item?: ProductSummary }) {
  const [value, setValue] = useState(initial);
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ProductList products={[item]} cart={value} onCart={setValue} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => vi.resetAllMocks());

describe('shop variant selection', () => {
  it('requires a choice, disables sold-out sizes, and adds the chosen variant at its price', async () => {
    const user = userEvent.setup();
    vi.mocked(addToCartAction).mockResolvedValue({ ok: true, cart: cart(['2', 1]) });
    render(<Shop />);
    expect(screen.getByRole('button', { name: en.member.cart.add })).toBeDisabled();
    expect(screen.getByText(en.shop.detail.chooseOption)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'S: Out of stock' })).toBeDisabled();
    // The base price is not a purchasable option: quote the actual variant minimum.
    expect(
      screen.getByText(`from ${formatMoney(2000, 'GEL', 'en')}`, { normalizer: (text) => text }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'L' }));
    expect(screen.getByRole('button', { name: 'L' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(formatMoney(4000, 'GEL', 'en'), { normalizer: (text) => text }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.member.cart.add }));
    await waitFor(() => expect(addToCartAction).toHaveBeenCalledWith('tee:2', 1));
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeEnabled();
  });

  it('keeps quantities and mutations separate when switching between sizes', async () => {
    const user = userEvent.setup();
    vi.mocked(updateCartItemAction).mockResolvedValue({ ok: true, cart: cart(['1', 3], ['2', 1]) });
    vi.mocked(removeCartItemAction).mockResolvedValue({ ok: true, cart: cart(['1', 3]) });
    render(<Shop initial={cart(['1', 2], ['2', 1])} />);
    await user.click(screen.getByRole('button', { name: 'M' }));
    expect(screen.getByText('2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await waitFor(() => expect(updateCartItemAction).toHaveBeenCalledWith('tee:1', 3));
    await user.click(screen.getByRole('button', { name: 'L' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removeCartItemAction).toHaveBeenCalledWith('tee:2'));
    expect(screen.getByRole('button', { name: en.member.cart.add })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'M' }));
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('adds a variant-less product with its base reference', async () => {
    const user = userEvent.setup();
    vi.mocked(addToCartAction).mockResolvedValue({ ok: true, cart: empty });
    render(<Shop item={{ ...product, variants: [] }} />);
    expect(screen.queryByRole('group', { name: 'Options' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.member.cart.add }));
    expect(addToCartAction).toHaveBeenCalledWith('tee:base', 1);
  });

  it('shows all sold-out options without an add control', () => {
    render(
      <Shop
        item={{ ...product, variants: product.variants.map((v) => ({ ...v, available: false })) }}
      />,
    );
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en.member.cart.add })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(
      true,
    );
  });
});
