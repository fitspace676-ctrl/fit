import type { ReactNode } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { useTheme, type ThemeColors } from '../../providers/ThemeProvider';

// Shared building blocks for the Settings screens: a titled section that groups
// rows into one rounded card, and the row variants those screens compose —
// read-only value rows, a navigation row (chevron), and a toggle row. Keeping
// them here means the Settings index and the notifications screen render
// identical chrome and both track system dark mode off `useTheme()`.

/** A titled group of rows rendered as one rounded, hairline-bordered card. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** A hairline divider between rows, inset to match the row padding. */
function Divider({ colors }: { colors: ThemeColors }) {
  return <View style={{ height: 1, marginLeft: 16, backgroundColor: colors.border }} />;
}

/** The shared label + optional hint stack used by every row. */
function RowLabel({ label, hint, colors }: { label: string; hint?: string; colors: ThemeColors }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 16, color: colors.text }}>{label}</Text>
      {hint ? <Text style={{ fontSize: 13, color: colors.textMuted }}>{hint}</Text> : null}
    </View>
  );
}

/** A read-only row: a label on the left, a value (or arbitrary content) on the right. */
export function ValueRow({
  label,
  value,
  hint,
  first,
}: {
  label: string;
  value?: string;
  hint?: string;
  /** Skip the top divider for the first row in a section. */
  first?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <>
      {first ? null : <Divider colors={colors} />}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <RowLabel label={label} hint={hint} colors={colors} />
        {value ? (
          <Text style={{ fontSize: 16, color: colors.textMuted, textAlign: 'right' }}>{value}</Text>
        ) : null}
      </View>
    </>
  );
}

/** A tappable navigation row with a trailing chevron. */
export function NavRow({
  label,
  hint,
  value,
  onPress,
  first,
}: {
  label: string;
  hint?: string;
  value?: string;
  onPress: () => void;
  first?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <>
      {first ? null : <Divider colors={colors} />}
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <RowLabel label={label} hint={hint} colors={colors} />
        {value ? <Text style={{ fontSize: 16, color: colors.textMuted }}>{value}</Text> : null}
        <Text style={{ fontSize: 18, color: colors.textMuted }}>›</Text>
      </Pressable>
    </>
  );
}

/** A row with a label/hint and a trailing on/off switch. */
export function ToggleRow({
  label,
  hint,
  value,
  onValueChange,
  disabled,
  first,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  first?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <>
      {first ? null : <Divider colors={colors} />}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <RowLabel label={label} hint={hint} colors={colors} />
        <Switch
          accessibilityLabel={label}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.onPrimary}
        />
      </View>
    </>
  );
}
