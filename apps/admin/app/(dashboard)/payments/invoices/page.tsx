import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  Permission,
  listAdminInvoicesQuerySchema,
  roleHasPermission,
  type ListAdminInvoicesResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchAdminInvoices } from '@/lib/api';
import { PaymentsTabs } from '@/components/payments-tabs';
import { CreateInvoiceDrawer } from './create-invoice-drawer';
import { InvoiceFilters } from './invoice-filters';
import { InvoicesTable } from './invoices-table';

export const metadata: Metadata = {
  title: 'Payments · Invoices - Fit Admin',
  description:
    'The gym’s invoices — raised automatically for subscriptions and shop orders, or by hand against a member. Search, filter, download a PDF, or email one to the member.',
};

// The roster reflects live billing state and the staff session token, so it must never
// be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** How many invoices one page of the roster shows. */
const PAGE_SIZE = 25;

/** Read one query-string value, collapsing Next's `string | string[]` into a string. */
function param(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/**
 * The Payments hub's Invoices tab.
 *
 * Server-renders one filtered page of `GET /admin/invoices` and hands it to the table.
 * The filters live in the URL, so this component is the single place the query is
 * built — it parses the search params through the same Zod schema the API validates
 * with, which means a hand-edited URL degrades to the defaults instead of erroring.
 *
 * The route already requires staff (middleware) and the API enforces `BillingRead`, so
 * the only failure handled here is the API call itself. Raising and emailing invoices
 * are `BillingManage`, resolved here and passed down so a read-only role sees the
 * roster with downloads but no create button and no email action.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('admin.invoicesHub');
  const params = await searchParams;

  const session = await getServerSession();
  const canManage = session !== null && roleHasPermission(session.role, Permission.BillingManage);

  const search = param(params.search);
  const type = param(params.type);
  const issuedFrom = param(params.issuedFrom);
  const issuedTo = param(params.issuedTo);

  // Parse with the API's own schema so a malformed hand-typed filter falls back to the
  // defaults rather than 400ing the page.
  const parsed = listAdminInvoicesQuerySchema.safeParse({
    page: param(params.page) || 1,
    limit: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(type ? { type } : {}),
    ...(issuedFrom ? { issuedFrom } : {}),
    ...(issuedTo ? { issuedTo } : {}),
  });
  const query = parsed.success ? parsed.data : { page: 1, limit: PAGE_SIZE };

  let result: ListAdminInvoicesResponse | null = null;
  let error: string | null = null;
  try {
    result = await fetchAdminInvoices(query);
  } catch (caught) {
    error =
      caught instanceof ApiError
        ? t('loadError', { status: caught.status, message: caught.message })
        : t('apiUnreachable');
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
      </header>

      <PaymentsTabs />

      {error ? (
        <p
          role="alert"
          className="rounded-card border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-700 dark:text-danger-300"
        >
          {error}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <InvoiceFilters
              search={search}
              type={type}
              issuedFrom={issuedFrom}
              issuedTo={issuedTo}
            />
            {canManage ? <CreateInvoiceDrawer /> : null}
          </div>

          <span className="font-mono text-xs text-ink-500 dark:text-ink-400">
            {t('invoiceCount', { count: result?.total ?? 0 })}
          </span>

          <InvoicesTable invoices={result?.data ?? []} canManage={canManage} />
        </>
      )}
    </div>
  );
}
