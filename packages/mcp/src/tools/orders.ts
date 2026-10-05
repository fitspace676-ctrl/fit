import { z } from 'zod';
import {
  cashReconciliationQuerySchema,
  listOrdersQuerySchema,
  recordPosSaleSchema,
  refundOrderSchema,
  sendReceiptSchema,
} from '@fit/types';
import { listOf, slimOrder } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/orders/orders.controller.ts. */
export const ordersTools = defineTools('sales', [
  {
    name: 'send_order_receipt',
    title: 'Send order receipt',
    titleKa: 'ქვითრის გაგზავნა',
    description:
      'Email a customer the receipt for a completed POS sale, given their address and the sale snapshot. Returns whether it was delivered or only logged because email is not set up.',
    method: 'post',
    path: '/orders/receipt',
    destructive: true,
    body: sendReceiptSchema,
  },
  {
    name: 'record_pos_sale',
    title: 'Record pos sale',
    titleKa: 'POS გაყიდვის დაფიქსირება',
    description:
      'Record a front-desk POS sale and its payment from a receipt, optionally at locationId; an attached planId also enrolls the member. Returns the order ids and totals.',
    method: 'post',
    path: '/orders/pos-sale',
    destructive: false,
    body: recordPosSaleSchema,
  },
  {
    name: 'get_cash_reconciliation',
    title: 'Get cash reconciliation',
    titleKa: 'სალაროს შეჯამება',
    description:
      "Read one business day's takings grouped by payment method with the expected cash total, for the gym or one branch's till. Use for end-of-day drawer counts.",
    method: 'get',
    path: '/orders/reconciliation',
    query: cashReconciliationQuerySchema,
  },
  {
    name: 'list_orders',
    core: true,
    project: listOf(slimOrder),
    title: 'List orders',
    titleKa: 'შეკვეთების სია',
    description:
      'List sales orders page by page, filtered by channel, status, member, branch or date: id, customer, status, total, currency, channel and date. Use get_order for items, payments and refunds.',
    method: 'get',
    path: '/orders',
    query: listOrdersQuerySchema,
  },
  {
    name: 'get_order',
    title: 'Get order',
    titleKa: 'შეკვეთის დეტალები',
    description:
      'Read one order in full: items, payments, refunds and its status timeline. Use before refund_order to check what was paid.',
    method: 'get',
    path: '/orders/:id',
    params: id,
  },
  {
    name: 'refund_order',
    title: 'Refund order',
    titleKa: 'შეკვეთის თანხის დაბრუნება',
    description:
      "Refund part or all of an order's captured payment with an amount in minor units, a reason and an optional restock. Returns the refund id; check get_order first.",
    method: 'post',
    path: '/orders/:id/refund',
    destructive: true,
    body: refundOrderSchema,
    params: id,
  },
]);
