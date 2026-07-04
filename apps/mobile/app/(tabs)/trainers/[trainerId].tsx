import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { TrainerDetail, TrainerScheduleEntry } from '@fit/types';
import { useI18n } from '../../../providers';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useTrainer } from '../../../hooks/useTrainer';
import { TrainerAvatar } from '../../../components/trainers/TrainerListCard';
import { TrainerNotFound } from '../../../lib/trainers';
import { formatTime, groupByDay } from '../../../lib/classes';

/**
 * Trainer detail — target of the `fit://trainers/:trainerId` deep link and the
 * tap target of every roster card. Loads one trainer's profile + upcoming
 * schedule (`GET /trainers/:id`) and renders it in the formacore "Aurora Glass"
 * dark identity (member-trainer-mobile artboard): a frosted glass back button, a
 * hero (avatar · name · headline), the bio, specialty chips, the locations, and
 * the upcoming sessions grouped by day.
 *
 * Degrades cleanly: a spinner while loading, a dedicated "trainer not found"
 * state for a `404` (a stale deep link to a removed trainer), and a retryable
 * error for anything transient.
 */
export default function TrainerDetailScreen() {
  const { trainerId } = useLocalSearchParams<{ trainerId: string }>();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const detail = useTrainer(gymId, trainerId);
  const isNotFound = detail.error instanceof TrainerNotFound;

  return (
    <View className="flex-1 bg-ink-950">
      {/* ---- top app bar ---- */}
      <View style={{ paddingTop: insets.top + 12 }} className="px-5 pb-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 flex-row items-center gap-1.5 self-start rounded-btn border border-white/10 bg-white/5 pl-2.5 pr-4 active:bg-white/10"
        >
          <Text className="text-lg font-bold text-ink-300">‹</Text>
          <Text className="text-[13px] font-semibold text-ink-200">
            {t('member.trainers.detail.back')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 28,
          gap: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        {detail.isLoading ? (
          <View className="items-center gap-3 py-24">
            <ActivityIndicator color="#9184F1" />
            <Text className="text-sm text-ink-400">{t('member.trainers.loading')}</Text>
          </View>
        ) : isNotFound ? (
          <View className="items-center gap-2 py-20">
            <Text className="text-4xl">🔍</Text>
            <Text className="text-lg font-bold text-white">
              {t('member.trainers.detail.notFound.title')}
            </Text>
            <Text className="max-w-[320px] text-center text-sm text-ink-400">
              {t('member.trainers.detail.notFound.subtitle')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              className="mt-2 rounded-btn border border-white/15 bg-white/5 px-5 py-2.5 active:bg-white/10"
            >
              <Text className="text-sm font-semibold text-white">
                {t('member.trainers.detail.notFound.action')}
              </Text>
            </Pressable>
          </View>
        ) : detail.isError ? (
          <View className="items-center gap-3 py-20">
            <Text className="text-center text-sm text-ink-400">{t('member.trainers.error')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void detail.refetch()}
              className="rounded-btn border border-white/15 bg-white/5 px-5 py-2.5 active:bg-white/10"
            >
              <Text className="text-sm font-semibold text-white">{t('member.trainers.retry')}</Text>
            </Pressable>
          </View>
        ) : detail.data ? (
          <TrainerDetailBody trainer={detail.data} locale={locale} t={t} />
        ) : null}
      </ScrollView>
    </View>
  );
}

/** The loaded trainer's body: hero, bio, specialties, locations, and the
 * upcoming schedule grouped by day. */
function TrainerDetailBody({
  trainer,
  locale,
  t,
}: {
  trainer: TrainerDetail;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const days = groupByDay(trainer.schedule);

  return (
    <View className="gap-[18px]">
      {/* ---- hero ---- */}
      <View className="items-center gap-3 pt-2">
        <TrainerAvatar name={trainer.name} avatarUrl={trainer.avatarUrl} size={92} />
        <View className="items-center gap-1">
          <Text className="text-center text-[26px] font-black leading-tight tracking-tight text-white">
            {trainer.name}
          </Text>
          {trainer.headline ? (
            <Text className="text-center text-sm text-brand-200">{trainer.headline}</Text>
          ) : null}
        </View>
      </View>

      {/* ---- bio ---- */}
      {trainer.bio ? (
        <Text className="text-[14px] leading-[21px] text-ink-300">{trainer.bio}</Text>
      ) : null}

      {/* ---- specialties ---- */}
      {trainer.specialties.length > 0 ? (
        <View className="gap-2.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[1.5px] text-ink-400">
            {t('member.trainers.detail.specialties')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {trainer.specialties.map((specialty) => (
              <View
                key={specialty}
                className="rounded-pill border border-brand-400/20 bg-brand-500/15 px-3 py-1.5"
              >
                <Text className="text-[12px] font-semibold text-brand-200">{specialty}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ---- locations ---- */}
      {trainer.locationNames.length > 0 ? (
        <View className="gap-2.5">
          <Text className="text-[11px] font-semibold uppercase tracking-[1.5px] text-ink-400">
            {t('member.trainers.detail.locations')}
          </Text>
          <View className="overflow-hidden rounded-card border border-white/10 bg-white/5">
            {trainer.locationNames.map((location, index) => (
              <View
                key={location}
                className={`flex-row items-center gap-2 px-4 py-3 ${
                  index === 0 ? '' : 'border-t border-white/[0.06]'
                }`}
              >
                <Text className="text-xs text-ink-500">📍</Text>
                <Text className="text-sm font-medium text-white">{location}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ---- upcoming schedule ---- */}
      <View className="gap-3">
        <Text className="text-[11px] font-semibold uppercase tracking-[1.5px] text-ink-400">
          {t('member.trainers.detail.schedule.title')}
        </Text>
        {days.length > 0 ? (
          <View className="gap-4">
            {days.map((group) => (
              <View key={group.key} className="gap-2">
                <Text className="text-[13px] font-bold text-ink-300">
                  {group.date.toLocaleDateString(locale, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <View className="overflow-hidden rounded-card border border-white/10 bg-white/5">
                  {group.items.map((session, index) => (
                    <ScheduleRow
                      key={session.id}
                      session={session}
                      locale={locale}
                      first={index === 0}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="items-center gap-2 rounded-card border border-white/10 bg-white/5 px-4 py-8">
            <Text className="text-2xl">🗓</Text>
            <Text className="text-center text-xs text-ink-500">
              {t('member.trainers.detail.schedule.empty')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** One upcoming session on the trainer's detail — time range · title, with the
 * location as a muted trailing note. Rows after the first carry a top hairline. */
function ScheduleRow({
  session,
  locale,
  first,
}: {
  session: TrainerScheduleEntry;
  locale: string;
  first: boolean;
}) {
  const timeRange = `${formatTime(session.startsAt, locale)} – ${formatTime(session.endsAt, locale)}`;
  return (
    <View
      className={`flex-row items-center gap-3 px-4 py-3.5 ${
        first ? '' : 'border-t border-white/[0.06]'
      }`}
    >
      <Text
        className="w-[92px] font-mono text-[12px] text-ink-300"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {timeRange}
      </Text>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-white">
          {session.title}
        </Text>
        {session.locationName ? (
          <Text numberOfLines={1} className="mt-0.5 text-xs text-ink-500">
            {session.locationName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
