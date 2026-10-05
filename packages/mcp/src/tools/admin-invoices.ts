import { z } from 'zod';
import { createInvoiceSchema, listAdminInvoicesQuerySchema } from '@fit/types';
import { listOf, slimInvoice } from './projections';
import { defineTools } from './shared';

/** Tenant-scoped endpoints in apps/api/src/billing/admin-invoices.controller.ts. */
export const adminInvoicesTools = defineTools('sales', [
  {
    name: 'list_invoices',
    project: listOf(slimInvoice),
    title: 'List invoices',
    titleKa: 'ინვოისების სია',
    description:
      'List invoices page by page, filtered by status or date: id, number, member, type, amount, currency, issue and due dates. Use for billing questions; sales receipts are in list_orders.',
    method: 'get',
    path: '/admin/invoices',
    query: listAdminInvoicesQuerySchema,
  },
  {
    name: 'create_invoice',
    title: 'Create invoice',
    titleKa: 'ინვოისის შექმნა',
    description:
      'Raise an invoice by hand against a member and return it with its number. Use email_invoice afterwards to send it.',
    method: 'post',
    path: '/admin/invoices',
    destructive: false,
    body: createInvoiceSchema,
  },
  {
    name: 'email_invoice',
    title: 'Email invoice',
    titleKa: 'ინვოისის გაგზავნა ელფოსტით',
    description:
      'Email an invoice as a PDF to the member it bills and report whether the mail was accepted. Fails when the member has no email address or email is not set up.',
    method: 'post',
    path: '/admin/invoices/:id/email',
    destructive: true,
    params: { id: z.string().min(1) },
  },
]);
