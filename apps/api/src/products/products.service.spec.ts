import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductStatus } from '@fit/db';
import { productVariantsSchema, type ProductVariants } from '@fit/types';
import { ProductsService } from './products.service';
import type { PrismaService } from '../prisma/prisma.service';

const VARIANTS: ProductVariants = productVariantsSchema.parse([
  { name: 'Small', sku: 'TS-S', priceAmount: 2500, stock: 10 },
  { name: 'Large', stock: 0 },
]);

/** A product row as the public projection selects it. */
interface ProductRecord {
  id: string;
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  images: string[];
  variants: unknown;
}

interface FindManyArgs {
  where?: { gymId?: string; status?: ProductStatus };
  orderBy?: unknown;
  select?: unknown;
}

const row = (over?: Partial<ProductRecord>): ProductRecord => ({
  id: 'p-1',
  name: 'Branded Tee',
  description: 'A soft cotton training tee.',
  priceAmount: 2999,
  currency: 'USD',
  images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  variants: VARIANTS,
  ...over,
});

function setup(rows: ProductRecord[] = []) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<ProductRecord[]>>(() =>
    Promise.resolve(rows),
  );
  const prisma = { client: { product: { findMany } } } as unknown as PrismaService;
  return { service: new ProductsService(prisma), findMany };
}

describe('ProductsService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listProducts', () => {
    it('scopes the query to the gym and only ACTIVE products, ordered by name', async () => {
      const { service, findMany } = setup();

      const result = await service.listProducts({ gymId: 'gym-1' });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { gymId: 'gym-1', status: ProductStatus.ACTIVE },
          orderBy: { name: 'asc' },
        }),
      );
      expect(result).toEqual({ products: [] });
    });

    it('projects a row to the public summary: primary image + resolved variants', async () => {
      const { service } = setup([row()]);

      const { products } = await service.listProducts({ gymId: 'gym-1' });

      expect(products).toEqual([
        {
          id: 'p-1',
          name: 'Branded Tee',
          description: 'A soft cotton training tee.',
          priceAmount: 2999,
          currency: 'USD',
          imageUrl: 'https://cdn.example.com/a.jpg',
          variants: [
            // Override price; in stock.
            { id: '0', name: 'Small', priceAmount: 2500, available: true },
            // No override → inherits the base price; out of stock → unavailable.
            { id: '1', name: 'Large', priceAmount: 2999, available: false },
          ],
        },
      ]);
    });

    it('maps a product with no images to a null imageUrl', async () => {
      const { service } = setup([row({ images: [], variants: [] })]);

      const { products } = await service.listProducts({ gymId: 'gym-1' });

      expect(products[0]?.imageUrl).toBeNull();
      expect(products[0]?.variants).toEqual([]);
    });

    it('falls back to an empty variant list when the stored JSON is malformed', async () => {
      const { service } = setup([row({ variants: { not: 'an array' } })]);

      const { products } = await service.listProducts({ gymId: 'gym-1' });

      expect(products[0]?.variants).toEqual([]);
    });
  });
});
