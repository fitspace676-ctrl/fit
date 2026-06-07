import { Pressable, Text, View } from 'react-native';
import type { MemberBookingHistoryEntry, MemberBookingStatus } from '@fit/types';
import { useI18n } from '../../providers/I18nProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { formatTime } from '../../lib/classes';

export interface BookingCardProps {
  entry: MemberBookingHistoryEntry;
  /** Called with the occurrence id when the card is tapped (opens class detail). */
  onPress: (instanceId: string) => void;
}

/** Status-pill colours, mirroring the web member panel's calm palette: active
 * states (booked / waitlist) stay legible, resolved / canceled ones dim. Each is
 * a `[background, text]` pair so the pill reads in both light and dark themes. */
const STATUS_COLORS: Record<MemberBookingStatus, readonly [string, string]> = {
  BOOKED: ['rgba(16,185,129,0.15)', '#059669'],
  WAITLIST: ['rgba(245,158,11,0.15)', '#d97706'],
  ATTENDED: ['rgba(37,99,235,0.15)', '#2563eb'],
  NO_SHOW: ['rgba(100,116,139,0.15)', '#64748b'],
  CANCELED: ['rgba(100,116,139,0.15)', '#64748b'],
};

/**
 * One booking on the My Bookings list (T6.5): the occurrence it is against —
 * category, title, schedule, trainer / location — plus the booking's own status
 * pill and, while waitlisted, the queue position. Tapping deep-links to the class
 * detail (`/classes/:id`), the same target as the calendar cards, so the member
 * can re-open the booking action from here. Colours come from `useTheme()`, so the
 * card tracks system dark mode like the rest of the app.
 */
export function BookingCard({ entry, onPress }: BookingCardProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { classInstance: instance, status } = entry;

  const [pillBg, pillText] = STATUS_COLORS[status];
  const subtitle = [instance.trainerName, instance.locationName].filter(Boolean).join(' · ');
  const pillLabel =
    status === 'WAITLIST' && entry.waitlistPosition != null
      ? t('account.bookings.waitlistPosition', { position: entry.waitlistPosition })
      : t(`account.bookings.status.${status}`);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(instance.id)}
      style={({ pressed }) => ({
        gap: 10,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              accessible={false}
              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: instance.color }}
            />
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                fontWeight: '600',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {instance.category}
            </Text>
          </View>
          <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
            {instance.title}
          </Text>
        </View>

        <View
          style={{
            flexShrink: 0,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: pillBg,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: pillText }}>{pillLabel}</Text>
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 14, color: colors.text }}>
          {new Date(instance.startsAt).toLocaleDateString(locale, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
          {' · '}
          {formatTime(instance.startsAt, locale)} – {formatTime(instance.endsAt, locale)}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.textMuted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
