import type { ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../providers/ThemeProvider';

// Shared scaffold for the Phase-6 screen stubs. Each tab/route ships a real,
// themed screen now (proving the provider stack — theme, i18n — is wired) and
// gets its feature content in the dedicated task (T6.3+). Reads colors off
// `useTheme()` so flipping system dark mode repaints it with no restart.
export function PlaceholderScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        paddingTop: insets.top + 24,
        gap: 12,
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>{title}</Text>
      {subtitle ? (
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textMuted }}>{subtitle}</Text>
      ) : null}
      {children}
    </ScrollView>
  );
}
