import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { resolveWindow, windowDays } from './report-window.util';

// Tbilisi is UTC+4 with no daylight saving, so every local midnight is a fixed
// 20:00Z the evening before — the arithmetic below reads off the page.
const TBILISI = 'Asia/Tbilisi';

describe('resolveWindow', () => {
  describe('today', () => {
    it("starts at the gym's midnight, not UTC's", () => {
      // 00:30Z is 04:30 on the 31st in Tbilisi; UTC would say the 31st too, but
      // only because the clock has just ticked over there as well.
      const now = new Date('2026-08-31T00:30:00.000Z');
      const win = resolveWindow('today', TBILISI, now);
      expect(win.start.toISOString()).toBe('2026-08-30T20:00:00.000Z');
      expect(win.end).toBe(now);
      expect(win.bucket).toBe('day');
    });

    it('at 22:00Z is still the 30th in UTC but already the 31st in Tbilisi', () => {
      const now = new Date('2026-08-30T22:00:00.000Z');
      expect(resolveWindow('today', TBILISI, now).start.toISOString()).toBe(
        '2026-08-30T20:00:00.000Z',
      );
      expect(resolveWindow('today', 'UTC', now).start.toISOString()).toBe(
        '2026-08-30T00:00:00.000Z',
      );
    });
  });

  describe('mtd', () => {
    it("runs from the 1st of the gym's month to now, by day", () => {
      const now = new Date('2026-08-15T10:00:00.000Z');
      const win = resolveWindow('mtd', TBILISI, now);
      expect(win.start.toISOString()).toBe('2026-07-31T20:00:00.000Z');
      expect(win.end).toBe(now);
      expect(win.bucket).toBe('day');
    });

    it('on the 1st is the same window as today', () => {
      const now = new Date('2026-09-01T05:00:00.000Z');
      expect(resolveWindow('mtd', TBILISI, now)).toEqual(resolveWindow('today', TBILISI, now));
    });
  });

  describe('custom', () => {
    const now = new Date('2026-08-31T10:00:00.000Z');

    it("covers both days inclusively, in the gym's zone", () => {
      const win = resolveWindow({ from: '2026-08-01', to: '2026-08-15' }, TBILISI, now);
      expect(win.start.toISOString()).toBe('2026-07-31T20:00:00.000Z');
      // The end is the START of the 16th: `to` is inclusive, the window is half-open.
      expect(win.end.toISOString()).toBe('2026-08-15T20:00:00.000Z');
      expect(win.bucket).toBe('day');
    });

    it('a single day is that whole day', () => {
      const win = resolveWindow({ from: '2026-08-10', to: '2026-08-10' }, TBILISI, now);
      expect(win.start.toISOString()).toBe('2026-08-09T20:00:00.000Z');
      expect(win.end.toISOString()).toBe('2026-08-10T20:00:00.000Z');
    });

    it('ending today stops at now, so the window never reaches into the future', () => {
      const win = resolveWindow({ from: '2026-08-25', to: '2026-08-31' }, TBILISI, now);
      expect(win.end).toBe(now);
    });

    it('refuses a `to` after today as a bad request', () => {
      expect(() => resolveWindow({ from: '2026-08-25', to: '2026-09-01' }, TBILISI, now)).toThrow(
        BadRequestException,
      );
    });

    it('picks the bucket from the span: days to a month, weeks to half a year, months beyond', () => {
      expect(resolveWindow({ from: '2026-08-01', to: '2026-08-31' }, TBILISI, now).bucket).toBe(
        'day',
      );
      expect(resolveWindow({ from: '2026-07-31', to: '2026-08-31' }, TBILISI, now).bucket).toBe(
        'week',
      );
      // 3 March to 31 August is 182 days, exactly 26 weeks; one more tips to months.
      expect(resolveWindow({ from: '2026-03-03', to: '2026-08-31' }, TBILISI, now).bucket).toBe(
        'week',
      );
      expect(resolveWindow({ from: '2026-03-02', to: '2026-08-31' }, TBILISI, now).bucket).toBe(
        'month',
      );
    });
  });

  describe('windowDays', () => {
    const now = new Date('2026-08-31T00:30:00.000Z'); // 04:30 on the 31st in Tbilisi

    it('names the first and last calendar day a window touches, in its zone', () => {
      expect(windowDays(resolveWindow('today', TBILISI, now))).toEqual({
        from: '2026-08-31',
        to: '2026-08-31',
      });
      // A rolling week opened at 04:30 on the 24th still touches the 24th.
      expect(windowDays(resolveWindow('7d', TBILISI, now))).toEqual({
        from: '2026-08-24',
        to: '2026-08-31',
      });
      expect(windowDays(resolveWindow('mtd', TBILISI, now))).toEqual({
        from: '2026-08-01',
        to: '2026-08-31',
      });
    });

    it('reads a custom window back as the two days that were asked for', () => {
      expect(
        windowDays(resolveWindow({ from: '2026-08-01', to: '2026-08-15' }, TBILISI, now)),
      ).toEqual({ from: '2026-08-01', to: '2026-08-15' });
    });
  });

  describe('presets the console no longer offers', () => {
    it('still resolve for the dashboard and the digest', () => {
      const now = new Date('2026-08-31T10:00:00.000Z');
      expect(resolveWindow('7d', 'UTC', now)).toEqual({
        start: new Date('2026-08-24T10:00:00.000Z'),
        end: now,
        bucket: 'day',
        zone: 'UTC',
      });
      expect(resolveWindow('30d', 'UTC', now).bucket).toBe('day');
      expect(resolveWindow('12w', 'UTC', now).bucket).toBe('week');
      expect(resolveWindow('12m', TBILISI, now)).toEqual({
        start: new Date('2025-08-30T20:00:00.000Z'),
        end: now,
        bucket: 'month',
        zone: TBILISI,
      });
    });
  });
});
