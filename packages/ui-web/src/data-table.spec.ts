import { describe, expect, it } from 'vitest';

import { nextSortDir, sortIndicator, pageBounds, alignClass } from './data-table';

describe('nextSortDir', () => {
  it('starts a newly-selected column ascending', () => {
    expect(nextSortDir(false, 'asc')).toBe('asc');
    expect(nextSortDir(false, 'desc')).toBe('asc');
  });

  it('flips the active column between asc and desc', () => {
    expect(nextSortDir(true, 'asc')).toBe('desc');
    expect(nextSortDir(true, 'desc')).toBe('asc');
  });
});

describe('sortIndicator', () => {
  it('is empty for an inactive column', () => {
    expect(sortIndicator(false, 'asc')).toBe('');
    expect(sortIndicator(false, 'desc')).toBe('');
  });

  it('shows an arrow matching the direction when active', () => {
    expect(sortIndicator(true, 'asc')).toBe('▲');
    expect(sortIndicator(true, 'desc')).toBe('▼');
  });
});

describe('pageBounds', () => {
  it('computes 1-based from/to for a middle page', () => {
    const b = pageBounds(2, 20, 45);
    expect(b.from).toBe(21);
    expect(b.to).toBe(40);
    expect(b.pageCount).toBe(3);
    expect(b.hasPrev).toBe(true);
    expect(b.hasNext).toBe(true);
  });

  it('reports zeros and no navigation for an empty set', () => {
    const b = pageBounds(1, 20, 0);
    expect(b.from).toBe(0);
    expect(b.to).toBe(0);
    expect(b.pageCount).toBe(1);
    expect(b.hasPrev).toBe(false);
    expect(b.hasNext).toBe(false);
  });

  it('caps the last page to the total and disables next', () => {
    const b = pageBounds(3, 20, 45);
    expect(b.from).toBe(41);
    expect(b.to).toBe(45);
    expect(b.hasNext).toBe(false);
    expect(b.hasPrev).toBe(true);
  });

  it('clamps an out-of-range page into the valid window', () => {
    const b = pageBounds(99, 10, 25);
    expect(b.from).toBe(21);
    expect(b.to).toBe(25);
    expect(b.hasNext).toBe(false);
  });

  it('treats a non-positive limit as a single row per page', () => {
    const b = pageBounds(1, 0, 3);
    expect(b.pageCount).toBe(3);
    expect(b.to).toBe(1);
  });
});

describe('alignClass', () => {
  it('defaults to left', () => {
    expect(alignClass()).toBe('text-left');
  });

  it('maps each alignment', () => {
    expect(alignClass('right')).toBe('text-right');
    expect(alignClass('center')).toBe('text-center');
    expect(alignClass('left')).toBe('text-left');
  });
});
