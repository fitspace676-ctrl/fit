import { Children, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing, type SpacingStep } from '../tokens/spacing';

import { gridRows } from './metrics';

// ===========================================================================
// AN EQUAL-COLUMN TILE GRID.
//
// `mobile-class-detail.tsx:189` is `grid grid-cols-2 gap-3`; home's counters
// (`mobile-home-v2.tsx:281`) are `flex gap-3` with two `flex-1` children,
// which is the same layout written the other way. Both are two columns of
// equal width with a 12pt gutter, which is the whole of what this needs to do.
// ===========================================================================

export interface TileGridProps {
  children: ReactNode;
  /** Default 2 — every grid in the artboards. */
  columns?: number;
  /** Space between columns and rows. Default `3` (12) — `gap-3`. */
  gap?: SpacingStep;
  /** Forwarded to the root node. */
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * A grid of equal-width tiles.
 *
 * ---------------------------------------------------------------------------
 * ROWS OF `flex: 1`, NOT A WRAPPING FLEX BOX.
 *
 * React Native has no CSS grid, and the obvious substitute — `flexWrap:
 * 'wrap'` with `width: '50%'` per child — cannot express a gap: 50% + 50% + 12
 * exceeds the container, the second column wraps, and every row holds one
 * item. The usual fix is to measure the container and compute a pixel width,
 * which means the grid renders wrong for one frame on every mount and lays
 * out twice on every rotation.
 *
 * Explicit rows of `flex: 1` children with `gap` between them needs no
 * measurement, is correct on the first frame, and is literally what home's
 * counters already are.
 *
 * The last row is padded with SPACERS rather than stretched. A lone tile in a
 * two-column grid must stay half-width — stretched to full it stops reading as
 * a member of the grid above it and starts reading as a banner.
 * ---------------------------------------------------------------------------
 */
export function TileGrid({
  children,
  columns = 2,
  gap = 3,
  testID,
  style,
  className,
}: TileGridProps) {
  const items = Children.toArray(children);
  const size = Number.isFinite(columns) && columns >= 1 ? Math.floor(columns) : 1;
  const rows = gridRows(items, size);
  const gutter = spacing[gap];

  return (
    <View testID={testID} style={[{ gap: gutter }, style]} className={className}>
      {/* `Children.toArray` has already given every item a stable key, but the
          ROWS are ours and their index is the only identity they have — which
          is the correct one: a row is positional by definition, so a reorder
          that changes which items are in row 1 has changed row 1. */}
      {rows.map((row, rowIndex) => (
        <View
          key={`row-${String(rowIndex)}`}
          testID={testID ? `${testID}-row-${String(rowIndex)}` : undefined}
          style={{ flexDirection: 'row', gap: gutter }}
        >
          {row.map((child, columnIndex) => (
            <View key={`cell-${String(columnIndex)}`} style={{ flex: 1, minWidth: 0 }}>
              {child}
            </View>
          ))}
          {/* The spacers. See the header. */}
          {Array.from({ length: size - row.length }, (_, index) => (
            <View
              key={`spacer-${String(index)}`}
              testID={testID ? `${testID}-spacer` : undefined}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
