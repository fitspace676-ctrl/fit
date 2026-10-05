import { z } from 'zod';
import { createProductCategorySchema, updateProductCategorySchema } from '@fit/types';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/products/admin-product-categories.controller.ts. */
export const adminProductCategoriesTools = defineTools('products', [
  {
    name: 'list_product_categories',
    title: 'List product categories',
    titleKa: 'პროდუქტის კატეგორიები',
    description:
      "List the shop's product categories by name with how many products each holds. Use to pick a categoryId for set_product_category.",
    method: 'get',
    path: '/admin/product-categories',
  },
  {
    name: 'create_product_category',
    title: 'Create product category',
    titleKa: 'პროდუქტის კატეგორიის შექმნა',
    description:
      'Create a shop product category with a unique name and return it. Check list_product_categories first to avoid duplicates.',
    method: 'post',
    path: '/admin/product-categories',
    destructive: false,
    body: createProductCategorySchema,
  },
  {
    name: 'rename_product_category',
    title: 'Rename product category',
    titleKa: 'კატეგორიის გადარქმევა',
    description:
      'Rename a shop product category; its products follow automatically. Returns the renamed category.',
    method: 'patch',
    path: '/admin/product-categories/:id',
    destructive: false,
    body: updateProductCategorySchema,
    params: id,
  },
  {
    name: 'delete_product_category',
    title: 'Delete product category',
    titleKa: 'პროდუქტის კატეგორიის წაშლა',
    description:
      'Delete a shop product category; its products are kept but become uncategorised, and the result says how many moved.',
    method: 'del',
    path: '/admin/product-categories/:id',
    destructive: true,
    params: id,
  },
]);
