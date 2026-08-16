// @fit/admin — the week grid's overlap arrangement.
//
// The rules a gym operator can see on the screen, pinned as tests: a class alone
// on the clock owns its column, classes that genuinely collide split it, a class
// grows back to full width the moment nothing sits beside it, and a cluster too
// dense to tile stacks instead of shrinking every card into an unreadable sliver.

import { describe, expect, it } from 'vitest';
import { layoutDay, MIN_READABLE_PCT, type LayoutInput } from './overlap';

/** A named event spanning `[start, end)` minutes from the top of the grid. */
function ev(item: string, startMin: number, endMin: number): LayoutInput<string> {
  return { item, startMin, endMin };
}

/** The box for `item`, or a failed lookup if the layout dropped it. */
function box(boxes: ReturnType<typeof layoutDay<string>>, item: string) {
  const found = boxes.find((b) => b.item === item);
  expect(found, `${item} is missing from the layout`).toBeDefined();
  return found!;
}

describe('layoutDay', () => {
  it('gives a class with the clock to itself the whole column', () => {
    const boxes = layoutDay([ev('yoga', 0, 60)]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ leftPct: 0, widthPct: 100, cascaded: false });
  });

  it('never drops an event', () => {
    const boxes = layoutDay([ev('a', 0, 60), ev('b', 30, 90), ev('c', 45, 75), ev('d', 200, 260)]);
    expect(boxes.map((b) => b.item).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('splits two classes running at the same time down the middle', () => {
    const boxes = layoutDay([ev('spin', 0, 60), ev('crossfit', 0, 60)]);
    expect(box(boxes, 'spin')).toMatchObject({ leftPct: 0, widthPct: 50 });
    expect(box(boxes, 'crossfit')).toMatchObject({ leftPct: 50, widthPct: 50 });
  });

  it('leaves classes that only touch at the boundary full width', () => {
    // 09:00–10:00 then 10:00–11:00 do not overlap: the span is half-open.
    const boxes = layoutDay([ev('first', 0, 60), ev('second', 60, 120)]);
    expect(box(boxes, 'first').widthPct).toBe(100);
    expect(box(boxes, 'second').widthPct).toBe(100);
  });

  it('expands a class back over a column that is free for its own span', () => {
    // `early` and `late` share a cluster through `bridge`, but nothing sits beside
    // `late` while it runs — so it takes the full width instead of half.
    const boxes = layoutDay([ev('early', 0, 60), ev('bridge', 30, 90), ev('late', 90, 150)]);
    expect(box(boxes, 'early').widthPct).toBe(50);
    expect(box(boxes, 'bridge').widthPct).toBe(50);
    expect(box(boxes, 'late').widthPct).toBe(100);
  });

  it('keeps three simultaneous classes readable by cascading instead of tiling', () => {
    const boxes = layoutDay([ev('a', 0, 60), ev('b', 0, 60), ev('c', 0, 60)]);
    expect(boxes.every((b) => b.cascaded)).toBe(true);
    // Every card stays at or above the readable floor — the point of the cascade.
    for (const b of boxes) {
      expect(b.widthPct).toBeGreaterThanOrEqual(MIN_READABLE_PCT);
    }
    // Later starts paint in front, and every card is offset from the one behind.
    expect(boxes.map((b) => b.z)).toEqual([1, 2, 3]);
    expect(new Set(boxes.map((b) => b.leftPct)).size).toBe(3);
  });

  it('keeps the cascade inside the column however many classes collide', () => {
    const boxes = layoutDay(Array.from({ length: 6 }, (_, i) => ev(`c${i}`, 0, 60)));
    for (const b of boxes) {
      expect(b.leftPct).toBeGreaterThanOrEqual(0);
      expect(b.leftPct + b.widthPct).toBeLessThanOrEqual(100.001);
      expect(b.widthPct).toBeGreaterThanOrEqual(MIN_READABLE_PCT);
    }
  });

  it('treats separate clusters independently', () => {
    const boxes = layoutDay([ev('a', 0, 60), ev('b', 0, 60), ev('solo', 120, 180)]);
    expect(box(boxes, 'solo')).toMatchObject({ leftPct: 0, widthPct: 100 });
  });

  it('handles an empty day', () => {
    expect(layoutDay([])).toEqual([]);
  });
});
