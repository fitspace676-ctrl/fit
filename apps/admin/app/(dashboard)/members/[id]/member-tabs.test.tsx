import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import type { MemberDetail } from '@fit/types';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';
import { MemberTabs } from './member-tabs';

// The panel under test renders no server action, but the module imports them, and
// those pull `next/headers` in through the session helper.
vi.mock('../actions', () => ({
  addMemberNoteAction: vi.fn(),
  freezeMemberSubscriptionAction: vi.fn(),
  grantMemberCreditPackAction: vi.fn(),
  unfreezeMemberSubscriptionAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

/** A member detail payload with every collection empty — only the profile matters here. */
function memberDetail(overrides: Partial<MemberDetail> = {}): MemberDetail {
  return {
    id: 'm-1',
    name: 'Ana Beridze',
    email: 'ana@example.com',
    phone: '555000111',
    status: 'ACTIVE',
    kind: 'MEMBER',
    kindOverride: null,
    planName: null,
    plan: null,
    lastVisitAt: null,
    nextBillingAt: null,
    billingState: 'none',
    outstanding: null,
    deletedAt: null,
    joinedAt: '2026-06-01T00:00:00.000Z',
    lifetimeValue: 0,
    currency: 'GEL',
    totalVisits: 0,
    currentPlan: null,
    recentActivity: [],
    attendance8w: [],
    subscriptions: [],
    bookings: [],
    payments: [],
    invoices: [],
    purchases: [],
    accessLog: [],
    dateOfBirth: '1994-03-02T00:00:00.000Z',
    startDate: '2026-07-01T00:00:00.000Z',
    personalId: '01001000000',
    gender: 'FEMALE',
    address: 'Rustaveli 1',
    emergencyContactName: 'Nino',
    emergencyContactPhone: '555000222',
    medicalNotes: null,
    notes: [],
    tasks: [],
    ...overrides,
  };
}

/** Render the tabs with the providers the dashboard layout supplies, on the Profile tab. */
function renderProfileTab(member: MemberDetail) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ThemeProvider initial="light">
        <ToastProvider>
          <MemberTabs
            member={member}
            canManageMembership={false}
            canSellCredits={false}
            creditPacks={[]}
            creditCatalogue={[]}
          />
        </ToastProvider>
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Profile' }));
}

/** The value rendered beside a `FieldRow`'s label. */
function fieldValue(label: string): string {
  const labelNode = screen.getByText(label);
  return labelNode.nextElementSibling?.textContent ?? '';
}

describe('member profile — membership start row', () => {
  it('renders the recorded day as a formatted date', () => {
    renderProfileTab(memberDetail());

    const value = fieldValue('Membership start');
    expect(value).not.toBe('-');
    expect(value).toContain('2026');
    // Formatted, not the raw ISO instant the API hands over.
    expect(value).not.toContain('T00:00:00');
  });

  it('renders a dash when the membership predates the field', () => {
    // `null` is the common case, not an error state: every membership created
    // before the gym switched the start-date intake toggle on has none.
    renderProfileTab(memberDetail({ startDate: null }));

    expect(fieldValue('Membership start')).toBe('-');
  });

  it('does not reuse the plan card’s "Start date" label', () => {
    // `detail.startDate` belongs to the current-period start on the Membership
    // tab — a billing anchor, and a different number. Two rows reading the same
    // words would be read as the same fact.
    renderProfileTab(memberDetail());

    expect(screen.queryByText('Start date')).toBeNull();
    expect(screen.getByText('Membership start')).toBeTruthy();
  });

  it('sits with the other recorded facts, between date of birth and national ID', () => {
    renderProfileTab(memberDetail());

    const labels = ['Date of birth', 'Membership start', 'National ID'].map((label) =>
      screen.getByText(label),
    );
    // `compareDocumentPosition` returns FOLLOWING (4) when the argument comes
    // after the node — i.e. the three rows are in this order in the document.
    expect(labels[0]!.compareDocumentPosition(labels[1]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(labels[1]!.compareDocumentPosition(labels[2]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
