import { Pressable, Text, View, type ColorValue, type GestureResponderEvent } from 'react-native';

import { useThemeColors } from '../theme';
import { radius, shadow } from '../tokens';

export interface TabBarIconProps {
  /** Emoji or text glyph used as the icon. */
  glyph: string;
  /**
   * Tint. Pass the `color` the navigator hands the `tabBarIcon` render prop so
   * the glyph tracks the active/inactive tint; omit to use the muted color.
   */
  color?: ColorValue;
  /** Glyph size in px. Defaults to 22. */
  size?: number;
}

/**
 * A flat tab-bar icon: a single glyph tinted to the navigator's active or
 * inactive color. Drop it into a screen's `tabBarIcon`:
 *
 *   tabBarIcon: ({ color }) => <TabBarIcon glyph="🗓" color={color} />
 */
export function TabBarIcon({ glyph, color, size = 22 }: TabBarIconProps) {
  const colors = useThemeColors();
  return <Text style={{ fontSize: size, color: color ?? colors.textMuted }}>{glyph}</Text>;
}

export interface TabBarFabProps {
  /** Glyph shown inside the raised button. */
  glyph: string;
  /** Accessible label (e.g. the tab title). */
  label: string;
  /** Press handler — pass the navigator's `tabBarButton` `onPress`. */
  onPress?: (event: GestureResponderEvent) => void;
}

/**
 * A raised, centered floating action button that replaces a flat tab item —
 * the mobile app's center QR check-in slot. Use it from a screen's
 * `tabBarButton`:
 *
 *   tabBarButton: (props) => (
 *     <TabBarFab glyph="▦" label={t('common.nav.qr')} onPress={props.onPress} />
 *   )
 */
export function TabBarFab({ glyph, label, onPress }: TabBarFabProps) {
  const colors = useThemeColors();
  return (
    <View
      pointerEvents="box-none"
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          backgroundColor: colors.primary,
          ...shadow.fab,
        }}
      >
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.onPrimary }}>{glyph}</Text>
      </Pressable>
    </View>
  );
}
