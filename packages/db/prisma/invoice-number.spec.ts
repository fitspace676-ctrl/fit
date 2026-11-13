import { describe, expect, it } from 'vitest';
import { subscriptionInvoiceDescription } from './invoice-number';

describe('subscriptionInvoiceDescription', () => {
  it('words the enrolment vs renewal charge and picks the cadence adjective', () => {
    expect(subscriptionInvoiceDescription('Premium', 'MONTH', 'enrolment')).toBe(
      'Premium - ყოველთვიური აბონემენტი',
    );
    expect(subscriptionInvoiceDescription('Premium', 'MONTH', 'renewal')).toBe(
      'Premium - ყოველთვიური განახლება',
    );
    expect(subscriptionInvoiceDescription('Elite', 'YEAR', 'renewal')).toBe(
      'Elite - წლიური განახლება',
    );
  });

  it('falls back to a generic label for a plan-less / blank plan name', () => {
    expect(subscriptionInvoiceDescription(null, 'MONTH', 'enrolment')).toBe(
      'აბონემენტი - ყოველთვიური აბონემენტი',
    );
    expect(subscriptionInvoiceDescription('   ', 'YEAR', 'renewal')).toBe(
      'აბონემენტი - წლიური განახლება',
    );
  });
});
