import { Pressable, Text, View } from 'react-native';
import type { ClassInstanceCard } from '@fit/types';
import { useI18n } from '../../providers/I18nProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { formatTime } from '../../lib/classes';

export interface ClassCardProps {
  instance: ClassInstanceCard;
  /** Called with the occurrence id when the card is tapped (opens detail). */
  onPress: (id: string) => void;
}

/**
 * One class occurrence as a tappable row, shared by both calendar views: a
 * category-coloured rail, the local start–end time, the title, the trainer ·
 * location subline, and a spots-left / full badge. Colours come from
 * `useTheme()` so the card repaints with system dark mode; the rail uses the
 * category `color` the API supplies (so the client never maps category→colour).
 */
export function ClassCard({ instance, onPress }: ClassCardProps) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();

  const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
  const isFull = spotsLeft === 0;
  const subtitle = [instance.trainerName, instance.locationName].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(instance.id)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        accessible={false}
        style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: instance.color }}
      />

      <View style={{ width: 88 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
          {formatTime(instance.startsAt, locale)}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>
          {formatTime(instance.endsAt, locale)}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
          {instance.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.textMuted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: isFull ? colors.textMuted : colors.primary,
        }}
      >
        {isFull
          ? t('classes.card.full')
          : t(spotsLeft === 1 ? 'classes.card.spotsLeftOne' : 'classes.card.spotsLeftOther', {
              count: spotsLeft,
            })}
      </Text>
    </Pressable>
  );
}
