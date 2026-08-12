import { describe, expect, it } from 'vitest';
import { subscriptionInvoiceDescription } from './invoice-number';

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
