import { Tabs } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type GestureResponderEvent,
} from 'react-native';
import { useTranslation } from '../../providers/I18nProvider';
import { useTheme } from '../../providers/ThemeProvider';

// Bottom-tab navigator: Home · Classes · [QR] · Shop · Profile. The QR
// check-in screen sits in the centre slot, rendered as a raised floating action
// button instead of a flat tab item. Tab colors and the active/inactive tints
// come from `useTheme()`, so the whole bar repaints when the system switches
// between light and dark. Labels come from the shared `@fit/i18n` catalogue.
//
// Home is the landing tab (the formacore member-home artboard, T7.2); the
// route guard (`useProtectedRoute`) drops an onboarded member here. Bookings is
// still a reachable route (Home's "upcoming bookings" section links to it), so
// it moves off the flat bar to keep the tab count to the five the QR FAB layout
// is designed around.

/** Emoji glyph used as a flat tab icon, tinted to the active/inactive color. */
function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 22, color }}>{glyph}</Text>;
}

/** Raised, centered floating action button that replaces the QR tab item. */
function QrFab({
  onPress,
  color,
  onColor,
  label,
}: {
  onPress?: (e: GestureResponderEvent) => void;
  color: string;
  onColor: string;
  label: string;
}) {
  return (
    <View style={styles.qrSlot} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={[styles.qrFab, { backgroundColor: color }]}
      >
        <Text style={[styles.qrGlyph, { color: onColor }]}>▦</Text>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const t = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('common.nav.home'),
          tabBarIcon: ({ color }) => <TabIcon glyph="🏠" color={color} />,
        }}
      />
      <Tabs.Screen
        name="classes"
        options={{
          title: t('common.nav.classes'),
          tabBarIcon: ({ color }) => <TabIcon glyph="🗓" color={color} />,
        }}
      />
      {/* Bookings stays a reachable route (linked from Home) but is lifted off
          the flat bar so the QR FAB keeps the centre of a five-slot layout. */}
      <Tabs.Screen name="bookings" options={{ href: null }} />
      {/* Trainers is a reachable stack (linked from Profile) kept off the flat
          bar for the same reason — the five-slot layout is built around the QR
          FAB, so extra destinations live behind in-screen links. */}
      <Tabs.Screen name="trainers" options={{ href: null }} />
      <Tabs.Screen
        name="qr"
        options={{
          title: t('common.nav.qr'),
          tabBarButton: (props) => (
            <QrFab
              onPress={props.onPress}
              color={colors.primary}
              onColor={colors.onPrimary}
              label={t('common.nav.qr')}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: t('common.nav.shop'),
          tabBarIcon: ({ color }) => <TabIcon glyph="🛍" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('common.nav.profile'),
          tabBarIcon: ({ color }) => <TabIcon glyph="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  qrSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  qrGlyph: {
    fontSize: 26,
    fontWeight: '700',
  },
});
