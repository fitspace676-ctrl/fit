import { View, type StyleProp, type ViewStyle } from 'react-native';

import { DECORATIVE } from '../internal/a11y';
import type { ColorRole } from '../tokens/semantic';
import { layout, spacing, type SpacingStep } from '../tokens/spacing';
import { useThemeColors } from '../tokens/theme';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  /**
   * Default `'border'` — `ink-800` in dark, `ink-200` in light. The artboards'
   * rules are `h-px bg-ink-800`, which is that role exactly.
   */
  color?: ColorRole;
  /** Inset from both ends, as a spacing step. The list-row divider's indent. */
  inset?: SpacingStep;
  /** Space above and below (or either side, when vertical). */
  spacingStep?: SpacingStep;
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * A one-point rule.
 *
 * ONE POINT, not `StyleSheet.hairlineWidth`. The artboards draw `h-px`, and a
 * hairline is 0.33pt on a 3× screen — on this palette (`ink-800` on `ink-900`,
 * a single step of separation) that renders as an intermittent, dithered line
 * that looks like a rendering bug rather than a divider. The design gets its
 * separation from the surface step, so where it does draw a rule, it means it.
 *
 * Always decorative: a screen reader announcing "separator" between every pair
 * of rows in a settings list is noise, and the grouping it is trying to convey
 * comes from the list's own structure.
 */
export function Divider({
  orientation = 'horizontal',
  color = 'border',
  inset,
  spacingStep,
  testID,
  style,
  className,
}: DividerProps) {
  const colors = useThemeColors();
  const thickness = layout.hairline;
  const gap = spacingStep === undefined ? undefined : spacing[spacingStep];
  const pad = inset === undefined ? undefined : spacing[inset];

  return (
    <View
      testID={testID}
      {...DECORATIVE}
      style={[
        { backgroundColor: colors[color] },
        orientation === 'horizontal'
          ? {
              height: thickness,
              alignSelf: 'stretch',
              ...(pad === undefined ? {} : { marginHorizontal: pad }),
              ...(gap === undefined ? {} : { marginVertical: gap }),
            }
          : {
              width: thickness,
              alignSelf: 'stretch',
              ...(pad === undefined ? {} : { marginVertical: pad }),
              ...(gap === undefined ? {} : { marginHorizontal: gap }),
            },
        style,
      ]}
      className={className}
    />
  );
}
