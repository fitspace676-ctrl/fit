import { z } from 'zod';
import {
  adjustStockSchema,
  createProductSchema,
  inventoryQuerySchema,
  listAdminProductsQuerySchema,
  listStockMovementsQuerySchema,
  lowStockQuerySchema,
  setProductCategorySchema,
  updateProductSchema,
} from '@fit/types';
import { listOf, slimInventory, slimLowStock, slimProduct, slimStockMovement } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/products/admin-products.controller.ts. */
export const adminProductsTools = defineTools('products', [
  {
    name: 'list_products',
    core: true,
    project: listOf(slimProduct),
    title: 'List products',
    titleKa: 'პროდუქტების სია',
    description:
      'List shop products page by page: id, name, status, price, currency, total stock and category. Use get_product for variants and full detail, list_inventory for per-branch stock.',
    method: 'get',
    path: '/admin/products',
    query: listAdminProductsQuerySchema,
  },
  {
    name: 'list_low_stock',
    project: listOf(slimLowStock),
    title: 'List low stock',
    titleKa: 'დაბალი მარაგი',
    description:
      'List active products at or below their reorder level, most urgent first, with the low variants and lowest count. Use to answer what needs reordering, optionally for one branch.',
    method: 'get',
    path: '/admin/products/low-stock',
    query: lowStockQuerySchema,
  },
  {
    name: 'list_inventory',
    project: listOf(slimInventory),
    title: 'List inventory',
    titleKa: 'მარაგის სია',
    description:
      'List current stock per product and variant, optionally for one branch: name, label, status, stock, reorder level and SKU, plus totals. Use list_stock_movements to explain changes.',
    method: 'get',
    path: '/admin/products/inventory',
    query: inventoryQuerySchema,
  },
  {
    name: 'get_product',
    title: 'Get product',
    titleKa: 'პროდუქტის დეტალები',
    description:
      'Read one product in full: description, price, cost, images, variants, stock and category. Use before update_product or adjust_product_stock.',
    method: 'get',
    path: '/admin/products/:id',
    params: id,
  },
  {
    name: 'create_product',
    title: 'Create product',
    titleKa: 'პროდუქტის შექმნა',
    description:
      'Create a shop product from a name with optional description, price, currency, images and variants. Returns the new product; set stock afterwards with adjust_product_stock.',
    method: 'post',
    path: '/admin/products',
    destructive: false,
    body: createProductSchema,
  },
  {
    name: 'update_product',
    title: 'Update product',
    titleKa: 'პროდუქტის რედაქტირება',
    description:
      "Edit a product's name, description, price, cost, images or variants and return the updated product. Read get_product first; stock counts change only through adjust_product_stock.",
    method: 'patch',
    path: '/admin/products/:id',
    destructive: true,
    body: updateProductSchema,
    params: id,
  },
  {
    name: 'set_product_category',
    title: 'Set product category',
    titleKa: 'პროდუქტის კატეგორიის მინიჭება',
    description:
      'Put a product in a shop category, or send categoryId null to leave it uncategorised. Category ids come from list_product_categories.',
    method: 'patch',
    path: '/admin/products/:id/category',
    destructive: false,
    body: setProductCategorySchema,
    params: id,
  },
  {
    name: 'set_product_status',
    title: 'Activate / deactivate product',
    titleKa: 'პროდუქტის ჩართვა ან გამორთვა',
    description:
      'Take a product off sale (active=false) or put it back on sale (active=true) and return the updated product. Confirm the product with get_product first.',
    method: 'post',
    path: '/admin/products/:id/deactivate',
    activePath: '/admin/products/:id/reactivate',
    destructive: true,
    params: id,
  },
  {
    name: 'adjust_product_stock',
    title: 'Adjust product stock',
    titleKa: 'მარაგის კორექცია',
    description:
      'Correct stock at one branch by a signed delta or an absolute setTo count, with a reason; locationId is required and never guessed, variantIndex picks a variant. Returns the movement and new count.',
    method: 'post',
    path: '/admin/products/:id/stock',
    destructive: true,
    body: adjustStockSchema,
    params: id,
  },
  {
    name: 'list_stock_movements',
    project: listOf(slimStockMovement),
    title: 'List stock movements',
    titleKa: 'მარაგის მოძრაობა',
    description:
      "List a product's stock history, newest first, optionally per branch: reason, change, resulting count, branch and time. Use to explain inventory changes, not to change stock.",
    method: 'get',
    path: '/admin/products/:id/stock-movements',
    query: listStockMovementsQuerySchema,
    params: id,
  },
]);
