import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { TrainerCard } from '@fit/types';
import { useI18n } from '../../../providers';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useTrainers } from '../../../hooks/useTrainers';
import { TrainerListCard } from '../../../components/trainers/TrainerListCard';

/**
 * Trainers browse — the formacore "Aurora Glass" trainer roster
 * (member-trainer-mobile artboard). A near-black `ink-950` canvas with:
 *
 *   • a top app bar (title eyebrow + the roster count),
 *   • a frosted search field (matches by name / headline / specialty),
 *   • a horizontally-scrolling specialty-filter chip row (All + the roster's
 *     specialties),
 *   • the matching trainers as tappable glass cards.
 *
 * One `GET /trainers` query (keyed on the gym) backs the whole screen; searching
 * and filtering re-slice that cached roster client-side without refetching.
 * Tapping a card deep-links to `/trainers/:id`. Dark-only, matching the
 * redesigned classes (T7.3) and home (T7.2) tabs.
 */
export default function TrainersScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const { data, isLoading, isError, refetch } = useTrainers(gymId);
  const trainers = data ?? [];

  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('__all');

  const specialties = useMemo(() => {
    const seen = new Set<string>();
    for (const trainer of trainers) for (const s of trainer.specialties) seen.add(s);
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [trainers]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return trainers.filter((trainer) => {
      if (specialty !== '__all' && !trainer.specialties.includes(specialty)) return false;
      if (!query) return true;
      return matchesQuery(trainer, query);
    });
  }, [trainers, search, specialty]);

  const hasFilters = search.trim().length > 0 || specialty !== '__all';
  const clearFilters = (): void => {
    setSearch('');
    setSpecialty('__all');
  };

  const filterChips = [
    { key: '__all', label: t('member.trainers.all') },
    ...specialties.map((s) => ({ key: s, label: s })),
  ];

  return (
    <View className="flex-1 bg-ink-950">
      {/* ---- top app bar ---- */}
      <View style={{ paddingTop: insets.top + 12 }}>
        <View className="px-5 pb-3">
          <Text className="font-mono text-[10px] uppercase tracking-[1.5px] text-ink-500">
            {t('member.trainers.eyebrow')}
          </Text>
          <View className="flex-row items-center gap-2">
            <Text className="mt-0.5 text-2xl font-extrabold tracking-tight text-white">
              {t('member.trainers.title')}
            </Text>
            {trainers.length > 0 ? (
              <Text className="mt-1.5 font-mono text-[11px] text-ink-500">{trainers.length}</Text>
            ) : null}
          </View>
        </View>

        {/* ---- search field ---- */}
        <View className="px-5 pb-3">
          <View className="h-11 flex-row items-center gap-2 rounded-btn border border-white/10 bg-white/5 px-3.5">
            <Text className="text-sm text-ink-500">🔍</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('member.trainers.searchPlaceholder')}
              placeholderTextColor="#5B6072"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              className="h-full flex-1 text-[15px] text-white"
              accessibilityLabel={t('member.trainers.search')}
            />
            {search.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('member.trainers.clear')}
                onPress={() => setSearch('')}
                hitSlop={8}
              >
                <Text className="text-sm text-ink-400">✕</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ---- specialty filter chips ---- */}
        {specialties.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}
          >
            {filterChips.map((chip) => {
              const active = specialty === chip.key;
              return (
                <Pressable
                  key={chip.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSpecialty(chip.key)}
                  className={`h-9 justify-center rounded-pill px-4 ${
                    active ? 'bg-white' : 'border border-white/10 bg-white/5 active:bg-white/10'
                  }`}
                >
                  <Text
                    className={`text-[13px] font-semibold ${active ? 'text-ink-950' : 'text-ink-300'}`}
                  >
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* ---- roster ---- */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: insets.bottom + 32,
          gap: 12,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <View className="items-center gap-3 py-16">
            <ActivityIndicator color="#9184F1" />
            <Text className="text-sm text-ink-400">{t('member.trainers.loading')}</Text>
          </View>
        ) : isError ? (
          <View className="items-center gap-3 py-16">
            <Text className="text-center text-sm text-ink-400">{t('member.trainers.error')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refetch()}
              className="rounded-btn border border-white/15 bg-white/5 px-4 py-2 active:bg-white/10"
            >
              <Text className="text-sm font-semibold text-white">{t('member.trainers.retry')}</Text>
            </Pressable>
          </View>
        ) : filtered.length > 0 ? (
          filtered.map((trainer) => (
            <TrainerListCard
              key={trainer.id}
              trainer={trainer}
              onPress={(id) => router.push(`/trainers/${id}`)}
            />
          ))
        ) : hasFilters ? (
          <View className="items-center gap-2 py-16">
            <Text className="text-3xl">🔍</Text>
            <Text className="text-base font-semibold text-white">
              {t('member.trainers.noMatch.title')}
            </Text>
            <Text className="text-center text-xs text-ink-500">
              {t('member.trainers.noMatch.subtitle')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={clearFilters}
              className="mt-1 rounded-btn border border-white/15 bg-white/5 px-4 py-2 active:bg-white/10"
            >
              <Text className="text-sm font-semibold text-white">
                {t('member.trainers.noMatch.action')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="items-center gap-2 py-16">
            <Text className="text-3xl">🏋️</Text>
            <Text className="text-base font-semibold text-white">
              {t('member.trainers.empty.title')}
            </Text>
            <Text className="text-center text-xs text-ink-500">
              {t('member.trainers.empty.subtitle')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** True when the query matches the trainer's name, headline, or any specialty. */
function matchesQuery(trainer: TrainerCard, query: string): boolean {
  if (trainer.name.toLowerCase().includes(query)) return true;
  if (trainer.headline.toLowerCase().includes(query)) return true;
  return trainer.specialties.some((s) => s.toLowerCase().includes(query));
}
