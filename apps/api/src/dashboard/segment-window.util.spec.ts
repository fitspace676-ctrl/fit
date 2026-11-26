import { describe, expect, it } from 'vitest';
import { resolveSegmentWindow } from './segment-window.util';
import { resolvePeriodWindow } from './dashboard.service';

const ZONE = 'Asia/Tbilisi';
// 2026-11-25 10:00 in Tbilisi (UTC+4).
const NOW = new Date('2026-11-25T06:00:00.000Z');

describe('resolveSegmentWindow', () => {
  it('uses the overview window for the header period, cut at now', () => {
    const { win, period } = resolveSegmentWindow(
      { granularity: 'daily', period: 'month' },
      ZONE,
      NOW,
    );
    const overview = resolvePeriodWindow({ period: 'month' }, NOW, ZONE);

    // Same first instant as the overview: the gym's midnight on the 1st.
    expect(win.start).toEqual(overview.start);
    expect(win.start.toISOString()).toBe('2026-10-31T20:00:00.000Z');
    // The month has not ended: the window stops at now, not on Dec 1.
    expect(win.end).toEqual(NOW);
    expect(win.bucket).toBe('day');
    expect(win.zone).toBe(ZONE);
    expect(period).toEqual({ period: 'month', from: '2026-11-01', to: '2026-11-30' });
  });

  it('keeps a past custom window whole and lets granularity pick only the bucket', () => {
    const { win, period } = resolveSegmentWindow(
      { granularity: 'weekly', period: 'custom', from: '2026-10-01', to: '2026-10-31' },
      ZONE,
      NOW,
    );

    expect(win.start.toISOString()).toBe('2026-09-30T20:00:00.000Z');
    expect(win.end.toISOString()).toBe('2026-10-31T20:00:00.000Z');
    expect(win.bucket).toBe('week');
    expect(period).toEqual({ period: 'custom', from: '2026-10-01', to: '2026-10-31' });
  });

  it('starts today at the gym midnight, not UTC midnight', () => {
    const { win } = resolveSegmentWindow({ granularity: 'daily', period: 'today' }, ZONE, NOW);

    expect(win.start.toISOString()).toBe('2026-11-24T20:00:00.000Z');
    expect(win.end).toEqual(NOW);
  });

  it('falls back to the rolling granularity window when no period is sent', () => {
    const { win, period } = resolveSegmentWindow({ granularity: 'daily' }, ZONE, NOW);

    expect(period).toBeNull();
    expect(win.end).toEqual(NOW);
    expect(NOW.getTime() - win.start.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
