import { z } from 'zod';
import { purchaseCreditPackSchema } from '@fit/types';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/billing/admin-credit-packs.controller.ts. */
export const adminCreditPacksTools = defineTools('sales', [
  {
    name: 'list_member_credit_packs',
    title: 'List member credit packs',
    titleKa: 'წევრის კრედიტ-პაკეტები',
    description:
      "List a member's usable session credit packs with credits remaining. Use for 'how many sessions does this member have left' questions.",
    method: 'get',
    path: '/admin/members/:id/credit-packs',
    params: id,
  },
  {
    name: 'grant_member_credit_pack',
    title: 'Grant member credit pack',
    titleKa: 'კრედიტ-პაკეტის მინიჭება წევრზე',
    description:
      'Sell or grant a catalogue session pack to a member and record the purchase. Returns creditPackId and orderId; id from list_members, packId from list_credit_pack_catalogue.',
    method: 'post',
    path: '/admin/members/:id/credit-packs',
    destructive: false,
    body: purchaseCreditPackSchema,
    params: id,
  },
  {
    name: 'list_credit_pack_catalogue',
    title: 'List credit pack catalogue',
    titleKa: 'კრედიტ-პაკეტების კატალოგი',
    description:
      "List the gym's purchasable session credit packs, cheapest first, with price and session count. Use to pick packId for grant_member_credit_pack.",
    method: 'get',
    path: '/admin/credit-packs/catalogue',
  },
]);
