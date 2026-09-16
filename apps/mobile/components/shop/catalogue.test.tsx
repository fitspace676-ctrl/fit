// The shop's arithmetic, pinned.
//
// These are pure functions with no React in them, so §5 would normally put them
// in the Vitest lane. They are here in the jest-expo lane for a mechanical
// reason: `vitest.config.ts` includes only `lib|hooks/**/*.spec.ts`, and
// `components/**` is not in it — a `.spec.ts` under `components/` would be run
// by NEITHER runner, which is the worst of the three outcomes. `*.test.tsx`
// under `components/` is claimed by `jest.config.js`'s `testMatch`, so it runs.
//
// WHAT IS WORTH PINNING, and why each one is a bug that does not throw:
//
//   * `variantRef` — `ProductVariantSummary.id` is a stringified INDEX and the
//     cart wants `"<productId>:<index>"`. Send the raw id and the server 404s
//     the line; send the variant NAME and it 404s differently. Neither is
//     visible in a screenshot.
//   * `productInitial` — `'ა'.toUpperCase()` is `'Ა'` (Mtavruli) in modern JS.
//     An English-speaking reviewer never sees this, and it is the app's
//     PRIMARY language.
//   * `isSoldOut` — a product with no variants has no availability flag at all
//     on the public listing, so guessing "unavailable" from missing data hides
//     a sellable product.
import {
  cartCount,
  hasPriceRange,
  isSoldOut,
  lineFor,
  listCurrency,
  lowestPrice,
  matchesQuery,
  productInitial,
  qtyOf,
  singleVariantRef,
  variantRef,
} from './catalogue';
import { FALLBACK_CURRENCY } from './money';

function product(overrides: Partial<Parameters<typeof lowestPrice>[0]> = {}) {
  return {
    id: 'p_1',
    name: 'Whey Protein 1kg',
    description: 'Vanilla',
    priceAmount: 8900,
    currency: 'GEL',
    imageUrl: null,
    variants: [],
    ...overrides,
  };
}

function line(overrides: Record<string, unknown> = {}) {
  return {
    variantId: 'p_1:base',
    productId: 'p_1',
    productName: 'Whey Protein 1kg',
    variantName: null,
    imageUrl: null,
    unitPrice: 8900,
    qty: 1,
    lineTotal: 8900,
    currency: 'GEL',
    available: true,
    ...overrides,
  };
}

function cart(items: ReturnType<typeof line>[]) {
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return { items, subtotal, discount: 0, total: subtotal, currency: 'GEL' };
}

describe('variantRef', () => {
  it('encodes an index, and the base sentinel for no variant', () => {
    expect(variantRef('p_1', '2')).toBe('p_1:2');
    expect(variantRef('p_1', null)).toBe('p_1:base');
  });

  it('encodes index 0 as 0, never as the base sentinel', () => {
    // `encodeVariantRef(id, 0)` and `encodeVariantRef(id, null)` are different
    // lines. A falsy check instead of a `=== null` one collapses them.
    expect(variantRef('p_1', '0')).toBe('p_1:0');
  });
});

describe('singleVariantRef', () => {
  it('is the base line for a product sold as-is', () => {
    expect(singleVariantRef(product())).toBe('p_1:base');
  });

  it('is the only variant when there is exactly one — nothing to choose', () => {
    expect(
      singleVariantRef(
        product({ variants: [{ id: '0', name: 'One size', priceAmount: 8900, available: true }] }),
      ),
    ).toBe('p_1:0');
  });

  it('is null with two or more, so the row opens the chooser instead of guessing', () => {
    expect(
      singleVariantRef(
        product({
          variants: [
            { id: '0', name: 'S', priceAmount: 4500, available: true },
            { id: '1', name: 'M', priceAmount: 5000, available: true },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe('pricing', () => {
  it('falls back to the base price with no variants', () => {
    expect(lowestPrice(product())).toBe(8900);
    expect(hasPriceRange(product())).toBe(false);
  });

  it('takes the cheapest variant, which may be under the base price', () => {
    const p = product({
      priceAmount: 8900,
      variants: [
        { id: '0', name: 'S', priceAmount: 4500, available: true },
        { id: '1', name: 'M', priceAmount: 5000, available: false },
      ],
    });
    expect(lowestPrice(p)).toBe(4500);
    // "from" appears with two or more options, and only then: with one there is
    // no range for the figure to be the bottom of.
    expect(hasPriceRange(p)).toBe(true);
  });

  it('is not a range with a single variant', () => {
    expect(
      hasPriceRange(
        product({ variants: [{ id: '0', name: 'One', priceAmount: 4500, available: true }] }),
      ),
    ).toBe(false);
  });
});

describe('isSoldOut', () => {
  it('is true only when every listed variant is unavailable', () => {
    expect(
      isSoldOut(
        product({
          variants: [
            { id: '0', name: 'S', priceAmount: 4500, available: false },
            { id: '1', name: 'M', priceAmount: 5000, available: false },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      isSoldOut(
        product({
          variants: [
            { id: '0', name: 'S', priceAmount: 4500, available: false },
            { id: '1', name: 'M', priceAmount: 5000, available: true },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('is false with no variants — the listing carries no flag to read', () => {
    expect(isSoldOut(product())).toBe(false);
  });
});

describe('the cart, read', () => {
  it('counts UNITS, not lines', () => {
    expect(cartCount(cart([line({ qty: 3 }), line({ variantId: 'p_2:base', qty: 2 })]))).toBe(5);
    expect(cartCount(cart([]))).toBe(0);
  });

  it('finds a line by reference, and answers 0 for one that is not there', () => {
    const c = cart([line({ qty: 4 })]);
    expect(lineFor(c, 'p_1:base')?.qty).toBe(4);
    expect(qtyOf(c, 'p_1:base')).toBe(4);
    expect(qtyOf(c, 'p_9:base')).toBe(0);
    // A 2+ variant product has no single reference, so it has no single count.
    expect(qtyOf(c, null)).toBe(0);
  });
});

describe('listCurrency', () => {
  it('reads the first product, and falls back before the listing lands', () => {
    expect(listCurrency([product({ currency: 'USD' })])).toBe('USD');
    expect(listCurrency([])).toBe(FALLBACK_CURRENCY);
    expect(listCurrency(undefined)).toBe(FALLBACK_CURRENCY);
  });
});

describe('productInitial', () => {
  it('upper-cases Latin', () => {
    expect(productInitial('whey protein')).toBe('W');
    expect(productInitial('  Shaker')).toBe('S');
  });

  it('LEAVES GEORGIAN ALONE — Mtavruli is not an initial', () => {
    // `'ა'.toUpperCase()` really is `'Ა'` in modern JS. Georgian uses that
    // letterform for headings and emphasis, never for a monogram.
    expect(productInitial('ამინომჟავები')).toBe('ა');
  });

  it('is undefined for a blank name rather than an empty plate glyph', () => {
    expect(productInitial('   ')).toBeUndefined();
  });
});

describe('matchesQuery', () => {
  it('matches the name and the description, case-insensitively', () => {
    expect(matchesQuery(product(), 'WHEY')).toBe(true);
    expect(matchesQuery(product(), 'vanilla')).toBe(true);
    expect(matchesQuery(product(), 'towel')).toBe(false);
  });

  it('matches everything on a blank or whitespace-only query', () => {
    expect(matchesQuery(product(), '')).toBe(true);
    expect(matchesQuery(product(), '   ')).toBe(true);
  });
});
