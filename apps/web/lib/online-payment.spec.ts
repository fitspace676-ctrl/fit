import { afterEach, describe, expect, it, vi } from 'vitest';
import { redirectToHostedPayment } from './online-payment';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('hosted checkout handoff', () => {
  it('paints progress before assigning the top-level window and prevents instant success', () => {
    vi.useFakeTimers();
    const assign = vi.fn();
    const progress = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    expect(redirectToHostedPayment({ status: 'requires_action', orderId: 'o1', checkoutUrl: 'https://pay.flitt.com/test', expiresAt: null }, progress)).toBe(true);
    expect(progress).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(assign).toHaveBeenCalledWith('https://pay.flitt.com/test');
  });
  it('preserves instant success for old responses and zero-total paid orders', () => {
    const progress = vi.fn();
    expect(redirectToHostedPayment(undefined, progress)).toBe(false);
    expect(redirectToHostedPayment({ status: 'paid', orderId: 'o1', checkoutUrl: null, expiresAt: null }, progress)).toBe(false);
    expect(progress).not.toHaveBeenCalled();
  });
});
