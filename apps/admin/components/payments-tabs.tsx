'use client';

// @fit/admin — the Payments hub's sub-navigation (Plans · Invoices · Products ·
// Transactions), consolidating what were separate top-level destinations into a
// single hub to mirror the reference admin's information architecture. Rendered
// at the top of each hub tab's index page; drill-down routes (plan/product/order
// detail, new/edit forms) intentionally omit it.

import { useTranslations } from 'next-intl';
import { HubTabs, type HubTab } from './hub-tabs';

export function PaymentsTabs() {
  const t = useTranslations('admin.paymentsTabs');
  const items: HubTab[] = [
    { href: '/payments', label: t('plans'), icon: 'card', exact: true },
    { href: '/payments/invoices', label: t('invoices'), icon: 'download' },
    { href: '/payments/products', label: t('products'), icon: 'bag' },
    { href: '/payments/transactions', label: t('transactions'), icon: 'chart' },
  ];
  return <HubTabs items={items} ariaLabel={t('ariaLabel')} />;
}
