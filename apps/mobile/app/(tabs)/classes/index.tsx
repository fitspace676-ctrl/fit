import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { ClassCalendarView, ClassInstanceCard } from '@fit/types';
import { useI18n, useTheme } from '../../../providers';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useClassInstances } from '../../../hooks/useClassInstances';
import { ClassCard } from '../../../components/classes/ClassCard';
import {
  addWeeks,
  dayKey,
  formatWeekRange,
  groupByDay,
  isSameDay,
  startOfWeek,
  weekDays,
} from '../../../lib/classes';

/**
 * Classes tab — the week/list calendar (T6.3). One `GET /class-instances` query
 * loads the selected week (keyed on gym + window via TanStack Query); the toggle
 * re-presents that same data without refetching:
 *
 *   • Week — a Mon→Sun day strip; tapping a day shows that day's sessions.
 *   • List — the whole week as a day-grouped agenda.
 *
 * Week navigation (‹ / Today / ›) moves the window. Tapping a card deep-links to
 * the class detail route (`/classes/:instanceId`, fleshed out in T6.4). All
 * colours come from `useTheme()`, so the screen tracks system dark mode.
 */
export default function ClassesScreen() {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<ClassCalendarView>('week');
  const [selectedKey, setSelectedKey] = useState(() =>
    dayKey(defaultSelected(startOfWeek(new Date()))),
  );

  const { data, isLoading, isError, refetch, isFetching } = useClassInstances(gymId, weekStart);
  const instances = data ?? [];

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of instances) {
      const key = dayKey(new Date(item.startsAt));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [instances]);
  const groups = useMemo(() => groupByDay(instances), [instances]);
  const selectedDayItems = useMemo(
    () => instances.filter((item) => dayKey(new Date(item.startsAt)) === selectedKey),
    [instances, selectedKey],
  );

  const goToWeek = (next: Date): void => {
    setWeekStart(next);
    setSelectedKey(dayKey(defaultSelected(next)));
  };

  const openClass = (id: string): void => {
    router.push(`/classes/${id}`);
  };

  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date()));

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 16 }}
    >
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
        {t('classes.title')}
      </Text>

      {/* Week navigation */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <NavButton
          label="‹"
          accessibilityLabel={t('classes.weekView.prev')}
          colors={colors}
          onPress={() => goToWeek(addWeeks(weekStart, -1))}
        />
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 15,
            fontWeight: '600',
            color: colors.text,
          }}
        >
          {formatWeekRange(weekStart, locale)}
        </Text>
        <NavButton
          label="›"
          accessibilityLabel={t('classes.weekView.next')}
          colors={colors}
          onPress={() => goToWeek(addWeeks(weekStart, 1))}
        />
      </View>
      {!isCurrentWeek ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => goToWeek(startOfWeek(new Date()))}
          hitSlop={8}
        >
          <Text
            style={{
              alignSelf: 'flex-start',
              fontSize: 13,
              fontWeight: '600',
              color: colors.primary,
            }}
          >
            {t('classes.weekView.today')}
          </Text>
        </Pressable>
      ) : null}

      {/* Week / List toggle */}
      <ViewToggle
        view={view}
        onChange={setView}
        colors={colors}
        groupLabel={t('classes.toggle.label')}
        weekLabel={t('classes.toggle.week')}
        listLabel={t('classes.toggle.list')}
      />

      {isLoading ? (
        <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('classes.loading')}</Text>
        </View>
      ) : isError ? (
        <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
            {t('classes.error')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refetch()}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
              {t('classes.retry')}
            </Text>
          </Pressable>
        </View>
      ) : view === 'week' ? (
        <View style={{ gap: 12 }}>
          <DayStrip
            days={days}
            selectedKey={selectedKey}
            countsByDay={countsByDay}
            colors={colors}
            locale={locale}
            onSelect={setSelectedKey}
          />
          {selectedDayItems.length > 0 ? (
            <View style={{ gap: 8 }}>
              {selectedDayItems.map((instance) => (
                <ClassCard key={instance.id} instance={instance} onPress={openClass} />
              ))}
            </View>
          ) : (
            <Text
              style={{
                paddingVertical: 32,
                textAlign: 'center',
                fontSize: 14,
                color: colors.textMuted,
              }}
            >
              {t('classes.weekView.dayEmpty')}
            </Text>
          )}
        </View>
      ) : groups.length > 0 ? (
        <View style={{ gap: 16 }}>
          {groups.map((group) => (
            <View key={group.key} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                  {group.date.toLocaleDateString(locale, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textMuted }}>
                  {t(
                    group.items.length === 1
                      ? 'classes.listView.itemsOne'
                      : 'classes.listView.itemsOther',
                    { count: group.items.length },
                  )}
                </Text>
              </View>
              {group.items.map((instance: ClassInstanceCard) => (
                <ClassCard key={instance.id} instance={instance} onPress={openClass} />
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ paddingVertical: 48, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
            {t('classes.empty.title')}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
            {t('classes.empty.subtitle')}
          </Text>
        </View>
      )}

      {/* Subtle background-refresh hint when revalidating a cached week. */}
      {isFetching && !isLoading ? (
        <ActivityIndicator color={colors.textMuted} style={{ marginTop: 4 }} />
      ) : null}
    </ScrollView>
  );
}

/** The day a freshly-selected week defaults to: today when it falls in the week, else the Monday. */
function defaultSelected(weekStart: Date): Date {
  const today = new Date();
  return weekDays(weekStart).find((day) => isSameDay(day, today)) ?? weekStart;
}

interface Colors {
  background: string;
  surface: string;
  primary: string;
  onPrimary: string;
  text: string;
  textMuted: string;
  border: string;
}

/** A square chevron / nav control for week stepping. */
function NavButton({
  label,
  accessibilityLabel,
  colors,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  colors: Colors;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

/** Segmented Week / List toggle. */
function ViewToggle({
  view,
  onChange,
  colors,
  groupLabel,
  weekLabel,
  listLabel,
}: {
  view: ClassCalendarView;
  onChange: (view: ClassCalendarView) => void;
  colors: Colors;
  groupLabel: string;
  weekLabel: string;
  listLabel: string;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={groupLabel}
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        padding: 2,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      {(['week', 'list'] as const).map((value) => {
        const active = view === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(value)}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: active ? colors.primary : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: active ? colors.onPrimary : colors.textMuted,
              }}
            >
              {value === 'week' ? weekLabel : listLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The Mon→Sun day selector for the week view, with a dot on days that have classes. */
function DayStrip({
  days,
  selectedKey,
  countsByDay,
  colors,
  locale,
  onSelect,
}: {
  days: Date[];
  selectedKey: string;
  countsByDay: Map<string, number>;
  colors: Colors;
  locale: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {days.map((day) => {
        const key = dayKey(day);
        const active = key === selectedKey;
        const hasClasses = (countsByDay.get(key) ?? 0) > 0;
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(key)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 8,
              gap: 4,
              borderRadius: 10,
              backgroundColor: active ? colors.primary : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: active ? colors.onPrimary : colors.textMuted,
              }}
            >
              {day.toLocaleDateString(locale, { weekday: 'short' })}
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: active ? colors.onPrimary : colors.text,
              }}
            >
              {day.getDate()}
            </Text>
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: hasClasses
                  ? active
                    ? colors.onPrimary
                    : colors.primary
                  : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
