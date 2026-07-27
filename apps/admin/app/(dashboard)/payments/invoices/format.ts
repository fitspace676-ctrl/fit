// @fit/admin — invoice-specific labels and date formatting for the Invoices tab.
//
// Money formatting is shared with the plans screens (`../format`); what's local to
// invoices is the type vocabulary and the calendar-date handling, since a due date is
// a *day* rather than a moment and must not drift with the viewer's timezone.

import type { InvoiceType } from '@fit/types';

/** The selectable invoice types and their human labels, in display order. */
export const INVOICE_TYPES: ReadonlyArray<{ value: InvoiceType; label: string }> = [
  { value: 'MEMBERSHIP', label: 'Membership' },
  { value: 'PERSONAL_TRAINING', label: 'Personal training' },
  { value: 'CLASS', label: 'Class' },
  { value: 'PRODUCT', label: 'Product' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'OTHER', label: 'Other' },
];

/** The human label for an invoice type, e.g. `Personal training`. */
export function invoiceTypeLabel(type: InvoiceType): string {
  return INVOICE_TYPES.find((entry) => entry.value === type)?.label ?? type;
}

/**
 * Render an ISO instant as a short calendar date (e.g. `26 Jul 2026`).
 *
 * Formatted in **UTC**, deliberately: issue and due dates are stored anchored to UTC
 * midnight, so formatting them in the viewer's zone would show the previous day to
 * anyone west of Greenwich. A null (a paid invoice's due date) renders as an em dash.
 */
export function formatInvoiceDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Today as the `YYYY-MM-DD` value a date input expects, in UTC so it agrees with how
 * the dates are stored and rendered.
 */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * True when an invoice's stated due date has passed — the roster flags these.
 *
 * Keyed on the date alone: the roster no longer carries a settlement state, so a
 * passed deadline is the only signal available (and the only one staff asked for).
 * An invoice with no due date is never overdue.
 */
export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) {
    return false;
  }
  return new Date(dueDate).getTime() < Date.now();
}
