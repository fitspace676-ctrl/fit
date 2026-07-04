import { describe, expect, it } from 'vitest';
import {
  INVOICE_SEQ_PAD_WIDTH,
  formatInvoiceNumber,
  subscriptionInvoiceDescription,
} from './invoice-number';

describe('formatInvoiceNumber', () => {
  it('zero-pads the sequence to the pad width and joins it to the year', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('2026-0001');
    expect(formatInvoiceNumber(2026, 42)).toBe('2026-0042');
    expect(formatInvoiceNumber(2026, 1234)).toBe('2026-1234');
  });

  it('renders a sequence that outgrows the pad width at its natural width (no truncation)', () => {
    expect(INVOICE_SEQ_PAD_WIDTH).toBe(4);
    expect(formatInvoiceNumber(2026, 10_000)).toBe('2026-10000');
    expect(formatInvoiceNumber(2026, 123_456)).toBe('2026-123456');
  });

  it('is monotonic — a later sequence sorts after an earlier one within a year', () => {
    expect(formatInvoiceNumber(2026, 2) > formatInvoiceNumber(2026, 1)).toBe(true);
    expect(formatInvoiceNumber(2026, 10) > formatInvoiceNumber(2026, 9)).toBe(true);
  });
});

describe('subscriptionInvoiceDescription', () => {
  it('words the enrolment vs renewal charge and picks the cadence adjective', () => {
    expect(subscriptionInvoiceDescription('Premium', 'MONTH', 'enrolment')).toBe(
      'Premium — monthly subscription',
    );
    expect(subscriptionInvoiceDescription('Premium', 'MONTH', 'renewal')).toBe(
      'Premium — monthly renewal',
    );
    expect(subscriptionInvoiceDescription('Elite', 'YEAR', 'renewal')).toBe(
      'Elite — annual renewal',
    );
  });

  it('falls back to a generic label for a plan-less / blank plan name', () => {
    expect(subscriptionInvoiceDescription(null, 'MONTH', 'enrolment')).toBe(
      'Subscription — monthly subscription',
    );
    expect(subscriptionInvoiceDescription('   ', 'YEAR', 'renewal')).toBe(
      'Subscription — annual renewal',
    );
  });
});
