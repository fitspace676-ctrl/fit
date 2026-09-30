// @fit/mobile — the join funnel's header: one navigation row, then the title.
//
// The pre-login redesign's shared header (mockups.md, "საერთო გადაწყვეტილებები"):
// a 44pt row with the back `IconButton` on the left and the funnel's name
// centred in it, then the screen title (`heading`, 24/28, wraps rather than
// truncates) and its description (`bodyRegular`, never clamped). No brand mark
// on the right — decision (გ) — so the right side of the row stays empty.
//
// The funnel name is plain `caption` Mkhedruli, NOT an `Eyebrow`: the eyebrow
// roles uppercase, and on iOS `toUpperCase` turns Mkhedruli into MTAVRULI
// (audit #15).

import { Heading, IconButton, Text, spacing } from '@fit/ui-mobile';
import { View } from 'react-native';

/** The navigation row's height — the back button's own 44pt target. */
const NAV_ROW_HEIGHT = 44;

export interface JoinHeaderProps {
  /** The screen's one `role="header"`. */
  title: string;
  subtitle?: string;
  /** The small funnel name centred in the navigation row. */
  kicker?: string;
  /** Omit to draw the row with no back button (the receipt has none). */
  onBack?: () => void;
  backLabel?: string;
  backTestID?: string;
  testID: string;
}

export function JoinHeader({
  title,
  subtitle,
  kicker,
  onBack,
  backLabel,
  backTestID,
  testID,
}: JoinHeaderProps) {
  return (
    <View testID={testID} style={{ paddingBottom: spacing[6] }}>
      <View
        style={{
          height: NAV_ROW_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing[3],
        }}
      >
        {onBack === undefined ? null : (
          <View style={{ position: 'absolute', left: 0, top: 0 }}>
            <IconButton
              icon="chevronLeft"
              accessibilityLabel={backLabel ?? ''}
              testID={backTestID}
              onPress={onBack}
            />
          </View>
        )}
        {kicker === undefined ? null : (
          <Text
            variant="caption"
            color="textSecondary"
            numberOfLines={1}
            style={{ paddingHorizontal: NAV_ROW_HEIGHT + spacing[2] }}
          >
            {kicker}
          </Text>
        )}
      </View>

      <Heading level={2}>{title}</Heading>
      {subtitle === undefined ? null : (
        <Text variant="bodyRegular" color="textSecondary" style={{ marginTop: spacing[2] }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
