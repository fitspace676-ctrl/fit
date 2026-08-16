// @fit/admin — how the week grid arranges classes that share the clock.
//
// (Named `overlap.ts`, not `layout.ts`: this sits inside an App Router route
// directory, where `layout` is a reserved filename Next treats as the route's
// layout component.)
//
// A gym runs two things at once all the time: spin in the studio while CrossFit
// is on the floor. The grid used to hand every event in an overlapping cluster
// `100 / lanes` percent of the column, which loses twice over. A 09:00 class was
// squeezed to half width because something *else* overlapped it at 08:30, even
// though nothing sat beside it at 09:00 — and once three classes met, each got a
// 47px sliver that could not hold a word of its title.
//
// The arrangement here is the one every calendar the operator already knows uses:
//
//   1. **Cluster.** Transitively-overlapping events form one group; the rest of
//      the day is untouched by them.
//   2. **Column.** Inside a cluster, each event takes the first column free at its
//      start time (greedy, earliest-start first).
//   3. **Expand.** An event then grows rightwards across columns that are empty
//      *for its own span*. This is the step that was missing: it is what lets the
//      09:00 class above go full width while the 08:30 one keeps its half.
//   4. **Cascade.** If a cluster is so dense that equal columns would fall under a
//      readable width, the events stop tiling and start stacking: each keeps
//      {@link MIN_READABLE_PCT} of the column, offset by a fixed step, later
//      starts in front. Every class keeps its coloured edge and its start time
//      visible, and the front one is fully legible — which beats four unreadable
//      slivers. Hovering or focusing any card lifts it to the front (a CSS
//      concern; this module only reports the stacking order).
//
// Pure functions over plain numbers: no DOM, no dates, no styling. The grid
// converts minutes to `rem` and percentages to CSS.

/** An event to place: minutes from the top of the grid window, `end` exclusive. */
export interface LayoutInput<T> {
  item: T;
  startMin: number;
  endMin: number;
}

/** Where one event lands: geometry as fractions of the day column. */
export interface LayoutBox<T> {
  item: T;
  startMin: number;
  endMin: number;
  /** Left edge, 0–100, as a percentage of the day column. */
  leftPct: number;
  /** Width, 0–100, as a percentage of the day column. */
  widthPct: number;
  /** Paint order within the column — higher sits in front. Only meaningful when cascading. */
  z: number;
  /** Whether this event's cluster had to stack rather than tile. */
  cascaded: boolean;
}

/**
 * The narrowest a tiled card may get before the cluster cascades instead, as a
 * percentage of the day column. A week column is roughly 145px wide, so 40% is
 * ~58px — enough for a time and a couple of characters of title. Below that the
 * card is decoration, not information.
 */
export const MIN_READABLE_PCT = 40;

/** How far each cascaded card is offset from the one behind it, in percent. */
const CASCADE_STEP_PCT = 18;

/**
 * Group `events` into runs of transitively-overlapping events, each run sorted by
 * start then end. Zero-length events are treated as touching nothing that merely
 * starts where they end, matching the half-open `[start, end)` spans above.
 */
function clusterOf<T>(events: LayoutInput<T>[]): LayoutInput<T>[][] {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const clusters: LayoutInput<T>[][] = [];
  let current: LayoutInput<T>[] = [];
  let reach = -Infinity;

  for (const event of sorted) {
    if (current.length > 0 && event.startMin >= reach) {
      clusters.push(current);
      current = [];
      reach = -Infinity;
    }
    current.push(event);
    reach = Math.max(reach, event.endMin);
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

/** Assign each event in a cluster the first column free at its start. */
function columnsOf<T>(cluster: LayoutInput<T>[]): { event: LayoutInput<T>; column: number }[] {
  const columnEnds: number[] = [];
  return cluster.map((event) => {
    let column = columnEnds.findIndex((end) => end <= event.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(event.endMin);
    } else {
      columnEnds[column] = event.endMin;
    }
    return { event, column };
  });
}

/**
 * How many columns to the right of `column` this event can grow into before it
 * would sit on top of another event in the same cluster. One column wide is the
 * floor, so the answer is always at least 1.
 */
function spanOf<T>(
  placed: { event: LayoutInput<T>; column: number }[],
  self: { event: LayoutInput<T>; column: number },
  columns: number,
): number {
  let span = 1;
  for (let next = self.column + 1; next < columns; next++) {
    const blocked = placed.some(
      (other) =>
        other.column === next &&
        other.event.startMin < self.event.endMin &&
        other.event.endMin > self.event.startMin,
    );
    if (blocked) break;
    span++;
  }
  return span;
}

/**
 * Arrange one day's events into the column geometry the grid draws.
 *
 * Order is preserved by start time, so the returned boxes can be rendered as-is;
 * `z` only matters for a cascaded cluster, where later starts paint in front.
 */
export function layoutDay<T>(events: LayoutInput<T>[]): LayoutBox<T>[] {
  const boxes: LayoutBox<T>[] = [];

  for (const cluster of clusterOf(events)) {
    const placed = columnsOf(cluster);
    const columns = placed.reduce((max, entry) => Math.max(max, entry.column + 1), 0);
    const tiledWidth = 100 / columns;

    // Dense cluster: stack instead of tiling, so nothing shrinks to a sliver.
    if (tiledWidth < MIN_READABLE_PCT) {
      // Spread the cards across whatever room is left over once the front card
      // has its readable width, so the cascade fits the column exactly however
      // many events are in it.
      const step = Math.min(CASCADE_STEP_PCT, (100 - MIN_READABLE_PCT) / (cluster.length - 1));
      cluster.forEach((event, index) => {
        boxes.push({
          item: event.item,
          startMin: event.startMin,
          endMin: event.endMin,
          leftPct: index * step,
          widthPct: 100 - index * step,
          z: index + 1,
          cascaded: true,
        });
      });
      continue;
    }

    for (const entry of placed) {
      const span = spanOf(placed, entry, columns);
      boxes.push({
        item: entry.event.item,
        startMin: entry.event.startMin,
        endMin: entry.event.endMin,
        leftPct: entry.column * tiledWidth,
        widthPct: span * tiledWidth,
        z: 1,
        cascaded: false,
      });
    }
  }

  return boxes.sort((a, b) => a.startMin - b.startMin || a.leftPct - b.leftPct);
}
