import { memo } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { TrainerCard } from '@fit/types';
import { trainerInitials } from '../../lib/trainers';

/**
 * One trainer as a tappable card in the browse list — the mobile counterpart of
 * the web `TrainerCard` (T3.7), restyled to the formacore "Aurora Glass" dark
 * identity: a frosted glass panel on the `ink-950` canvas with the trainer's
 * avatar (or an initials placeholder when there's no photo), name + headline, a
 * truncated bio, up to three specialty chips, and a location line. Purely
 * presentational — the list owns the roster, filtering, and the query.
 */
export const TrainerListCard = memo(function TrainerListCard({
  trainer,
  onPress,
}: {
  trainer: TrainerCard;
  onPress: (id: string) => void;
}) {
  const specialties = trainer.specialties.slice(0, 3);
  const extraSpecialties = trainer.specialties.length - specialties.length;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={trainer.name}
      onPress={() => onPress(trainer.id)}
      className="overflow-hidden rounded-card border border-white/10 bg-white/5 p-4 active:bg-white/10"
    >
      <View className="absolute inset-x-0 top-0 h-px bg-white/10" />

      <View className="flex-row items-center gap-3.5">
        <TrainerAvatar name={trainer.name} avatarUrl={trainer.avatarUrl} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-base font-extrabold tracking-tight text-white">
            {trainer.name}
          </Text>
          {trainer.headline ? (
            <Text numberOfLines={1} className="mt-0.5 text-[13px] text-ink-400">
              {trainer.headline}
            </Text>
          ) : null}
        </View>
        <Text className="text-lg font-bold text-ink-500">›</Text>
      </View>

      {trainer.bio ? (
        <Text numberOfLines={2} className="mt-3 text-[13px] leading-[19px] text-ink-300">
          {trainer.bio}
        </Text>
      ) : null}

      {specialties.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap items-center gap-1.5">
          {specialties.map((specialty) => (
            <View
              key={specialty}
              className="rounded-pill border border-brand-400/20 bg-brand-500/15 px-2.5 py-1"
            >
              <Text className="text-[11px] font-semibold text-brand-200">{specialty}</Text>
            </View>
          ))}
          {extraSpecialties > 0 ? (
            <Text className="text-[11px] font-semibold text-ink-500">+{extraSpecialties}</Text>
          ) : null}
        </View>
      ) : null}

      {trainer.locationNames.length > 0 ? (
        <View className="mt-3 flex-row items-center gap-1.5">
          <Text className="text-[11px] text-ink-500">📍</Text>
          <Text numberOfLines={1} className="flex-1 text-xs text-ink-400">
            {trainer.locationNames.join(' · ')}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

/** A round avatar: the trainer's photo when set, else an initials placeholder on
 * a brand-tinted disc. Shared by the list card and the detail hero. */
export function TrainerAvatar({
  name,
  avatarUrl,
  size = 52,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="border border-white/10 bg-white/5"
      />
    );
  }

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="items-center justify-center border border-brand-400/25 bg-brand-500/20"
    >
      <Text style={{ fontSize: size * 0.36 }} className="font-extrabold text-brand-100">
        {trainerInitials(name)}
      </Text>
    </View>
  );
}
