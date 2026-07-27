'use client';

import { useState, useTransition } from 'react';
import type { AdminInvoiceRow } from '@fit/types';
import { Card, Icon, useToast } from '@/components/ui';
import { adminPath } from '@/lib/base-path';
import { formatPrice } from '../format';
import { formatInvoiceDate, invoiceTypeLabel, isOverdue } from './format';
import { emailInvoiceAction } from './actions';

/** Header cell styling, shared by every column. */
const TH_CLASS =
  'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400';

/** Body cell styling. */
const TD_CLASS = 'px-4 py-3 text-sm text-ink-700 dark:text-ink-200';

/** Shared styling for the row's three actions, so they read as one control group. */
const ACTION_CLASS =
  'inline-flex h-8 items-center gap-1.5 rounded-btn px-2.5 text-xs font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-ink-300 dark:ring-white/10 dark:hover:text-white';

/**
 * The gym's invoices as a table, with the two per-row actions staff need: download the
 * PDF and email it to the member.
 *
 * The download is a plain `<a>` to the admin's own proxy route rather than a fetch —
 * the staff session is an httpOnly cookie the browser cannot forward as a bearer
 * token, so the server route re-attaches it and streams the PDF back as an attachment.
 *
 * Emailing is a server action. Its two expected failures — outbound mail not
 * configured, and a member with no address — come back as sentences and are shown as
 * a toast, because neither is something the staffer can fix from this screen.
 */
export function InvoicesTable({
  invoices,
  canManage,
}: {
  invoices: AdminInvoiceRow[];
  canManage: boolean;
}) {
  const { toast } = useToast();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function sendEmail(invoice: AdminInvoiceRow): void {
    setSendingId(invoice.id);
    startTransition(async () => {
      const result = await emailInvoiceAction(invoice.id);
      setSendingId(null);
      if (result.ok) {
        toast(`Invoice ${invoice.number} sent to ${result.data.to}`, {
          tone: 'success',
          icon: 'mail',
        });
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  if (invoices.length === 0) {
    return (
      <Card className="px-4 py-16 text-center">
        <Icon name="download" className="mx-auto h-9 w-9 text-ink-300 dark:text-ink-600" sw={1.8} />
        <p className="mt-3 font-display text-lg font-bold text-ink-900 dark:text-white">
          No invoices yet
        </p>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Invoices raised for subscriptions and shop orders land here automatically — or create one
          by hand.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse">
          <thead>
            <tr className="border-b border-ink-200 dark:border-white/10">
              <th className={TH_CLASS}>Invoice #</th>
              <th className={TH_CLASS}>Member</th>
              <th className={TH_CLASS}>Type</th>
              <th className={TH_CLASS}>Issued</th>
              <th className={TH_CLASS}>Due</th>
              <th className={`${TH_CLASS} text-right`}>Amount</th>
              <th className={`${TH_CLASS} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const overdue = isOverdue(invoice.dueDate);
              return (
                <tr
                  key={invoice.id}
                  className="border-b border-ink-100 last:border-0 dark:border-white/[0.06]"
                >
                  <td className={`${TD_CLASS} font-mono tabular-nums`}>{invoice.number}</td>
                  <td className={TD_CLASS}>
                    <div className="font-medium text-ink-900 dark:text-white">
                      {invoice.memberName ?? '—'}
                    </div>
                    {invoice.description ? (
                      <div className="max-w-xs truncate text-xs text-ink-500 dark:text-ink-400">
                        {invoice.description}
                      </div>
                    ) : null}
                  </td>
                  <td className={TD_CLASS}>{invoiceTypeLabel(invoice.type)}</td>
                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    {formatInvoiceDate(invoice.issuedAt)}
                  </td>
                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <span
                      className={
                        overdue ? 'font-semibold text-danger-600 dark:text-danger-400' : undefined
                      }
                    >
                      {formatInvoiceDate(invoice.dueDate)}
                    </span>
                    {overdue ? (
                      <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger-600 dark:text-danger-400">
                        overdue
                      </span>
                    ) : null}
                  </td>
                  <td className={`${TD_CLASS} text-right font-mono tabular-nums`}>
                    {formatPrice(invoice.amount, invoice.currency)}
                  </td>
                  <td className={`${TD_CLASS} text-right`}>
                    <div className="inline-flex items-center gap-1">
                      {/* Both are plain anchors so the browser handles the file
                          itself, which is also why the basePath is ours to add. */}
                      <a
                        href={adminPath(`/payments/invoices/${invoice.id}/pdf?view=1`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={ACTION_CLASS}
                        aria-label={`View invoice ${invoice.number}`}
                      >
                        <Icon name="eye" className="h-3.5 w-3.5" sw={2} />
                        View
                      </a>
                      <a
                        href={adminPath(`/payments/invoices/${invoice.id}/pdf`)}
                        className={ACTION_CLASS}
                        aria-label={`Download invoice ${invoice.number}`}
                      >
                        <Icon name="download" className="h-3.5 w-3.5" sw={2} />
                        PDF
                      </a>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => sendEmail(invoice)}
                          // Nothing to send to when the member is gone or has no address;
                          // the API would 422, so don't offer the action at all.
                          disabled={sendingId === invoice.id || !invoice.memberEmail}
                          title={
                            invoice.memberEmail
                              ? `Email invoice ${invoice.number} to ${invoice.memberEmail}`
                              : 'This member has no email address'
                          }
                          className={ACTION_CLASS}
                        >
                          <Icon name="mail" className="h-3.5 w-3.5" sw={2} />
                          {sendingId === invoice.id ? 'Sending…' : 'Email'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
