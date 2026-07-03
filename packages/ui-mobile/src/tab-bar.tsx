import { Text, type ColorValue } from 'react-native';
import { type ThemeColors } from './tokens';

/**
 * Screen-option fragment for an Expo Router / React Navigation bottom-tab
 * navigator, themed from the runtime palette. Spread it into `<Tabs>`:
 *
 *   <Tabs screenOptions={{ ...tabBarScreenOptions(colors) }} />
 *
 * Kept as a plain object (no navigation types imported here) so `@fit/ui-mobile`
 * doesn't take an expo-router dependency — the consumer already has one.
 */
export function tabBarScreenOptions(colors: ThemeColors) {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
    },
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '600' as const,
    },
  };
}

export interface TabBarIconProps {
  /** Emoji or glyph rendered as the icon. */
  glyph: string;
  /** Tint supplied by the navigator (active / inactive colour). */
  color: ColorValue;
  /** Glyph size in px. Defaults to 22. */
  size?: number;
}

/** A flat, tinted glyph tab icon matching the formacore mobile tab bar. */
export function TabBarIcon({ glyph, color, size = 22 }: TabBarIconProps) {
  return <Text style={{ fontSize: size, color }}>{glyph}</Text>;
}
