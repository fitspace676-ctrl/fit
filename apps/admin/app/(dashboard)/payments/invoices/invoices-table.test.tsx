// @fit/admin — the invoice roster's branch column (Stage 5).
//
// Pinned here rather than checked by hand because the seed mints no invoices at
// all: there is nothing on this screen in dev to look at, so these three cases
// are the only place the column's behaviour is stated.
//
// The column is conditional for the same reason the members roster's and the POS
// sales log's are: it exists to help a reader looking at every branch at once, and
// is a constant repeating the chrome as soon as the console has narrowed to one.
// The third case is the one unique to invoices — a document with no branch is
// "not attributable", reachable only in all-branches mode, and must never render
// as a blank cell.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AdminInvoiceRow } from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';
import { InvoicesTable } from './invoices-table';

vi.mock('next/navigation', () => navigationMock.factory());

// The table imports the tab's server actions (emailing an invoice); those pull
// `next/headers` in through the session helper and are not this spec's subject.
vi.mock('./actions', () => ({
  createInvoiceAction: vi.fn(),
  emailInvoiceAction: vi.fn(),
  searchMembersForInvoiceAction: vi.fn(),
}));

/**
 * One roster row. Every neighbouring cell that can render the same "-" placeholder
 * — member, due date — is given a real value, so a dash found in these tests can
 * only be the branch cell's.
 */
function invoiceRow(overrides: Partial<AdminInvoiceRow> = {}): AdminInvoiceRow {
  return {
    id: 'inv-1',
    number: 'INV-0001',
    memberId: 'm-1',
    memberName: 'Ana Beridze',
    memberEmail: 'ana@example.com',
    type: 'MEMBERSHIP',
    description: 'January membership',
    amount: 5000,
    currency: 'GEL',
    locationName: 'Riverside',
    issuedAt: '2026-01-05T00:00:00.000Z',
    dueDate: '2026-01-20T00:00:00.000Z',
    ...overrides,
  };
}

function renderRoster(invoices: AdminInvoiceRow[], showBranch: boolean) {
  return render(
    <ThemeProvider initial="light">
      <ToastProvider>
        <InvoicesTable invoices={invoices} canManage showBranch={showBranch} />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe('InvoicesTable — the branch column', () => {
  it('names each invoice’s branch in "All locations" mode', () => {
    // The roster expands — one row per document — so two adjacent rows can belong
    // to different branches with nothing else on the row saying which.
    renderRoster(
      [invoiceRow(), invoiceRow({ id: 'inv-2', number: 'INV-0002', locationName: 'Downtown' })],
      true,
    );

    expect(screen.getByRole('columnheader', { name: 'Branch' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Riverside' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Downtown' })).toBeDefined();
  });

  it('renders a dash, not a blank cell, for an invoice with no branch', () => {
    // Null means "not attributable" — the billed member was purged, or their branch
    // was retired. An empty cell reads as a row that failed to load.
    renderRoster([invoiceRow({ locationName: null })], true);

    expect(screen.getByRole('cell', { name: '-' })).toBeDefined();
  });

  it('drops the column once the console is scoped to one branch', () => {
    // Every row would repeat the branch the chrome already names, taking width from
    // the money figures the table exists to show. A branchless invoice is also
    // unreachable in this mode — the API matches the branch by equality with no
    // NULL arm — so nothing is hidden by dropping the column.
    renderRoster([invoiceRow()], false);

    expect(screen.queryByRole('columnheader', { name: 'Branch' })).toBeNull();
    expect(screen.queryByRole('cell', { name: 'Riverside' })).toBeNull();
  });
});
