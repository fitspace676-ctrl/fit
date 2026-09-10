// Classes — the schedule. `mobile-classes.tsx`, on real data.
//
// ===========================================================================
// THIS SCREEN RENDERS SIGNED OUT, AND THAT IS THE POINT.
//
// `ROUTE_POLICY` has `'(tabs)/classes': 'public'`. The deleted app's guard sent
// every signed-out user to `/login` from every route, which made discovery
// unreachable — §1 of the plan names it as one of the three foundations that
// were wrong. So: the whole week is readable with no session, and the wall is
// the BOOK button (`useClassBooking.request`), which prompts sign-in and hands
// the guard a `next=` pointing at the class the visitor pressed on.
//
// The consequence is the tenant. Every gym-scoped query hook takes its gym from
// the access token, which a signed-out visitor does not have, so `useClasses()`
// would be permanently disabled here. `useDiscoveryGym()` is the fallback —
// session gym, else the public `GET /gyms/by-subdomain/:slug` — and the listing
// is built from the EXPORTED `classesQueryOptions(gymId, window)` rather than
// from `useClasses`, which is the seam that factory exists for ("options for
// `GET /class-instances`, built from a nullable gym scope"). Still a `hooks/`
// import; `lib/api/**` is never touched from a screen.
//
// ---------------------------------------------------------------------------
// FIVE BRANCHES (plan §6), AND THE OFFLINE ONE IS THE ODD ONE.
//
//   loading    skeletons the size of the cards they replace, so the page does
//              not jump when the week lands.
//   offline    `onlineManager` PAUSES a query rather than failing it, so with a
//              dead radio and a cold cache the query sits `isPending` forever
//              and the error box never fires. That is a real state and it needs
//              its own branch. TODO(i18n): there are ZERO `offline` keys in
//              either catalogue (plan §7), so it renders `OfflineNotice`, the
//              one marked English placeholder the auth screens already share.
//   error      `EmptyState` with a WORKING retry — `invalidateQueries` on the
//              gym's classes root, never `.refetch()`.
//   empty      two of them, and they are different questions: "nothing is on
//              this day" vs "your filters exclude everything", the second with
//              a one-tap clear.
//   signed-out not a branch of the LIST at all — see above.
//
// ---------------------------------------------------------------------------
// COPY IS `member.classes` (D10), WHICH IS WHY THIS SCREEN LOOKS LIKE THIS.
//
// That namespace carries `periods.morning/afternoon/evening` — the artboard's
// own grouping — plus `today`, `prevWeek`/`nextWeek` and the tri-state
// book/booked/waitlisted/full/spotsLeft. The filter SHEET is the one part that
// reads `classes.filters`, because `member.classes` has no filter block.
//
// ---------------------------------------------------------------------------
// ONE DEVIATION FROM THE ARTBOARD, WRITTEN DOWN.
//
// The artboard has no week navigation — it draws a single fixed week. But
// `member.classes` carries `prevWeek` / `nextWeek`, the API's window is a
// parameter, and a schedule you can only ever see seven days of is not a
// schedule. `today` is spoken by the current day's cell rather than being a
// third control the comp does not have.
//
// THE TWO CONTROLS USED TO LIVE INSIDE THE DAY RAIL, on the reasoning that a
// 320pt device would rather scroll them than squeeze the days. Measured, that
// was backwards: seven 50pt cells, six gaps, two 44pt chevrons and the edge
// padding come to 500pt, so on a 402pt screen Saturday clipped, Sunday was
// off-screen — and the NEXT-WEEK chevron was off-screen too, with nothing
// on screen to say it existed. A control that cannot be seen is not a control
// that scrolls; it is one that is gone. They are now a fixed row around the
// rail, and only the days scroll.
//
// ---------------------------------------------------------------------------
// TWO TABS: THE SCHEDULE, AND THE MEMBER'S OWN SEATS IN IT.
//
// "My bookings" was three taps away — Profile, then a row, then the segment —
// which is a long way from the screen the booking was made on, and the two
// questions ("what is on?" and "what am I in?") are asked one after the other.
// So the second one is a `Segmented` under the AppBar, and its content is
// `components/classes/my-bookings-view.tsx`, shared verbatim with
// `/profile/bookings` (still a route: Profile links to it and deep links to it
// resolve). ONE implementation, two hosts — see that file's header.
//
// Three consequences worth naming, because each was a bug first:
//
//   · The filter button belongs to the SCHEDULE. Left in the AppBar on the
//     bookings tab it opens a sheet whose chips narrow a list that is not on
//     screen, so it is rendered only for `tab === 'classes'`.
//   · The two class sheets are unmounted with their tab, and `setTab` closes
//     the filter sheet on the way out — `Sheet` is single-instance per screen
//     and the bookings view brings two of its own.
//   · `key={tab}` on the `Screen`. Switching tabs must put the member at the
//     TOP of what they switched to; `Screen` owns its `ScrollView` and exposes
//     no ref, and a fresh scroller starts at zero. It is a remount of chrome
//     the tab content was going to remount anyway — the two tabs share no
//     state, and the queries are held by hooks ABOVE the `Screen`, so nothing
//     refetches.
// ===========================================================================

import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClassInstanceCard } from '@fit/types';
import {
  AppBar,
  Chip,
  DAY_CELL_WIDTH,
  DayCell,
  EmptyState,
  Heading,
  IconButton,
  Mono,
  SCREEN_GUTTER,
  ScrollRail,
  Screen,
  Segmented,
  Skeleton,
  layout,
  spacing,
  useThemeColors,
} from '@fit/ui-mobile';

import { BookingFailureNotice } from '../../../components/classes/booking-notice';
import { ClassBookingSheet } from '../../../components/classes/booking-sheet';
import { ClassListCard } from '../../../components/classes/class-list-card';
import { ClassFilterSheet } from '../../../components/classes/filter-sheet';
import { MyBookingsView } from '../../../components/classes/my-bookings-view';
import {
  bookingsByClassId,
  myBookingsPhase,
  type MyBooking,
} from '../../../components/classes/my-bookings';
import {
  DAYS_IN_WEEK,
  EMPTY_FILTERS,
  activeFilterCount,
  addDays,
  applyFilters,
  classesOn,
  countsByDay,
  dayKey,
  dayOfMonth,
  deriveFacets,
  formatLongDate,
  formatMonth,
  formatWeekdayShort,
  groupByPeriod,
  isSameDay,
  startOfDay,
  startOfWeek,
  weekDays,
  weekWindow,
  type ClassFilterState,
} from '../../../components/classes/schedule';
import { useClassBooking } from '../../../components/classes/use-class-booking';
import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import { combinePhases, sectionPhase, type SectionPhase } from '../../../components/home/section';
import { classesQueryOptions } from '../../../hooks/queries/useClasses';
import { useDiscoveryGym } from '../../../hooks/useDiscoveryGym';
import { useMyBookings } from '../../../hooks/queries/useBookings';
import { useGymId } from '../../../hooks/useActiveGym';
import { queryKeys } from '../../../lib/query-keys';
import { useI18n } from '../../../providers/I18nProvider';

/** Which half of the screen is on: the schedule, or the member's own seats. */
type ClassesTab = 'classes' | 'bookings';

export default function ClassesScreen() {
  const { t, plural, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useIsOnline();

  const gym = useDiscoveryGym();
  const booking = useClassBooking();
  // The SESSION's gym, which is what `useMyBookings` scopes itself by — not
  // `gym.gymId`, which may be the public tenant lookup's answer.
  const sessionGymId = useGymId();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [filters, setFilters] = useState<ClassFilterState>(EMPTY_FILTERS);
  // ONE sheet state for the screen, per `Sheet`'s single-instance rule: two
  // overlapping `Modal`s flash black on iOS. The confirm sheet is the other
  // member of this union in spirit — it is driven by `booking.target`, which
  // `request()` cannot set while the filter sheet is up, because the filter
  // sheet covers the cards.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [tab, setTab] = useState<ClassesTab>('classes');
  const switchTab = useCallback((next: ClassesTab) => {
    // The filter sheet belongs to the schedule and the bookings view brings two
    // sheets of its own — `Sheet` is single-instance per screen, so the one on
    // the way out closes before the ones on the way in can mount.
    setFiltersOpen(false);
    setTab(next);
  }, []);

  // The window is part of the query key, so stepping to next week is a NEW
  // cache entry rather than a refetch that discards this one — going back is
  // instant. That is `useClasses`' own documented behaviour, preserved here.
  // Named `range`, not `window`: shadowing the global `window` inside a React
  // Native module is legal and confusing in equal measure.
  const range = useMemo(() => weekWindow(weekStart), [weekStart]);
  const classes = useQuery(classesQueryOptions(gym.gymId, range));
  // Disabled while signed out (no session gym), which is exactly right: the
  // public schedule needs no member state, and firing this without a token
  // would be a guaranteed 401.
  const bookings = useMyBookings('upcoming');

  const instances = useMemo<ClassInstanceCard[]>(
    () => classes.data?.instances ?? [],
    [classes.data],
  );
  const facets = useMemo(() => deriveFacets(instances), [instances]);
  const counts = useMemo(() => countsByDay(instances), [instances]);
  const myBookings = useMemo(() => bookingsByClassId(bookings.data), [bookings.data]);

  const visible = useMemo(() => applyFilters(instances, filters), [instances, filters]);
  const dayClasses = useMemo(() => classesOn(visible, selectedDay), [visible, selectedDay]);
  const groups = useMemo(() => groupByPeriod(dayClasses), [dayClasses]);

  const activeCount = activeFilterCount(filters);
  const today = startOfDay(new Date());

  /**
   * Which cell the rail should bring into view.
   *
   * `-1` when the selection is not in the week on screen, which `ScrollRail`
   * reads as "index 0, do not scroll" via `railScrollOffset`'s own `index <= 0`
   * guard. That is the honest answer: there is no cell to centre.
   */
  const selectedIndex = useMemo(
    () => weekDays(weekStart).findIndex((day) => isSameDay(day, selectedDay)),
    [weekStart, selectedDay],
  );

  const stepWeek = useCallback(
    (weeks: number) => {
      const next = startOfWeek(addDays(weekStart, weeks * DAYS_IN_WEEK));
      setWeekStart(next);
      // Keep the selection inside the week on screen, or the strip shows one
      // week and the cards below show another. Both setters, never a side
      // effect inside a state updater — React may call an updater twice.
      setSelectedDay(next);
    },
    [weekStart],
  );

  const retry = useCallback(() => {
    gym.retry();
    if (gym.gymId !== null) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.classes(gym.gymId) });
    }
    // The bookings half of the join is now part of the phase, so it is part of
    // the retry too — a retry that re-read only half of what failed would leave
    // the error box on screen with nothing left to fix it.
    if (sessionGymId !== null) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings(sessionGymId) });
    }
  }, [gym, queryClient, sessionGymId]);

  const openClass = useCallback(
    (instance: ClassInstanceCard) => {
      router.push(`/classes/${instance.id}`);
    },
    [router],
  );

  const act = useCallback(
    (instance: ClassInstanceCard, mine: MyBooking) => {
      // Belt and braces on `Sheet`'s single-instance rule: the filter sheet
      // covers the cards, so this cannot normally overlap — but two `Modal`s
      // whose `visible` overlaps for even one frame flash black on iOS, and
      // that is not a bug worth leaving to layout.
      setFiltersOpen(false);
      booking.request({
        id: instance.id,
        title: instance.title,
        startsAt: instance.startsAt,
        trainerName: instance.trainerName,
        locationName: instance.locationName,
        capacity: instance.capacity,
        bookedCount: instance.bookedCount,
        status: mine.status,
      });
    },
    [booking],
  );

  // `fetchStatus === 'paused'` is `onlineManager` holding the request rather
  // than failing it. With nothing cached that is the offline state.
  const paused = classes.fetchStatus === 'paused' && classes.data === undefined;
  const offline = !online || paused;

  // =========================================================================
  // THE LIST IS A JOIN, SO ITS PHASE IS A JOIN — `combinePhases`, LIKE HOME.
  //
  // The cards need TWO answers: the schedule (`GET /class-instances`, public)
  // and the member's own seats (`GET /me/bookings`). Gating on the schedule
  // alone was the bug: when `/me/bookings` 500s, `bookingsByClassId(undefined)`
  // returns `{}`, every lookup misses, and every card asserts "not booked" —
  // a claim with a Book button attached, answered by `409 ALREADY_BOOKED`.
  //
  // Home says exactly this about its own `bookablePhase` and guards it with
  // `combinePhases`; this is the same guard, one screen over. See
  // `myBookingsPhase` for why signed-out is `ready` rather than `loading`.
  // =========================================================================
  const gymPhase: SectionPhase = gym.isError ? 'error' : gym.isPending ? 'loading' : 'ready';
  const listPhase = combinePhases(
    gymPhase,
    sectionPhase(classes, online),
    myBookingsPhase(bookings, online, sessionGymId !== null),
  );

  const loading = listPhase === 'loading' && !offline;
  const failed = listPhase === 'error' && !offline;
  const ready = listPhase === 'ready' && !offline;

  return (
    <Screen
      // The scroll position belongs to the tab that was scrolled, and `Screen`
      // owns its `ScrollView` without exposing a ref — so a new key is how the
      // member arrives at the top of what they switched to. See the header.
      key={tab}
      testID="classes-screen"
      // Off, because the two rails below are full-bleed: a rail's edge padding
      // belongs to its content, and putting it on the container clips the last
      // chip 20pt short of the screen edge. Every other section re-applies it.
      gutter={false}
      header={
        <AppBar
          gutter
          eyebrow={
            tab === 'classes' ? formatMonth(selectedDay, locale) : t('account.bookings.eyebrow')
          }
          // The screen's first `role="header"`; the period groups add the rest.
          title={t('member.classes.title')}
          trailing={
            // The filter narrows the SCHEDULE. On the bookings tab it would
            // open a sheet of chips against a list that is not on screen.
            tab === 'classes' ? (
              <IconButton
                icon="filter"
                accessibilityLabel={t('classes.filters.groupLabel')}
                onPress={() => {
                  setFiltersOpen(true);
                }}
                // Lime plate the moment anything is narrowing the list — the
                // artboard's own `activeFilters > 0` treatment.
                selected={activeCount > 0}
                {...(activeCount > 0 ? { badge: { count: activeCount } } : {})}
                testID="classes-filter-button"
              />
            ) : undefined
          }
        />
      }
    >
      <View style={{ gap: layout.sectionGap }}>
        <View style={{ paddingHorizontal: layout.screenGutter }}>
          <Segmented
            testID="classes-tabs"
            label={t('member.classes.viewLabel')}
            value={tab}
            onChange={switchTab}
            options={[
              { value: 'classes', label: t('member.classes.title') },
              { value: 'bookings', label: t('member.classes.myBookings') },
            ]}
          />
        </View>

        {tab === 'bookings' ? (
          <View style={{ paddingHorizontal: layout.screenGutter }}>
            {/* From the bookings TAB, "browse classes" is the tab beside it —
                `router.push('/classes')` would push the route the member is
                already standing on. */}
            <MyBookingsView
              onBrowseClasses={() => {
                switchTab('classes');
              }}
            />
          </View>
        ) : (
          <>
            <View style={{ gap: spacing[4] }}>
              {/*
            ==================================================================
            THE CHEVRONS ARE OUTSIDE THE RAIL, AND THE RAIL SCROLLS TO THE DAY.
            //
            Both halves were the same bug. Seven 50pt cells, six 6pt gaps, two
            44pt chevrons and 40pt of edge padding is 500pt of content inside a
            402pt viewport, so Saturday clipped mid-cell, Sunday was off-screen
            — and so was the "next week" chevron, WITH NOTHING ON SCREEN TO
            SUGGEST IT EXISTED. A member could not reach next week at all
            except by discovering a horizontal scroll on a rail whose right
            edge showed a half-drawn day.

            Putting the two chevrons in a fixed row around the rail is the fix
            that survives every screen width: the two controls that change the
            WEEK are always reachable, and only the seven days — the thing a
            rail is for — scroll. What is left inside the rail is exactly the
            fixed-width, uniform run `scrollToIndex` was written for
            (`layout/metrics.ts: railScrollOffset`), so the selected day is
            centred on mount and follows the selection thereafter, which it
            never did before.

            `edgePadding={spacing[2]}`: the rail no longer bleeds to the screen
            edges — the chevrons hold them — so it wants a gap from its
            neighbours, not the 20pt screen gutter.
            ==================================================================
          */}
              <View
                testID="classes-week"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: SCREEN_GUTTER,
                }}
              >
                <IconButton
                  icon="chevronLeft"
                  accessibilityLabel={t('member.classes.prevWeek')}
                  onPress={() => {
                    stepWeek(-1);
                  }}
                  variant="surface"
                  testID="classes-prev-week"
                />
                <ScrollRail
                  testID="classes-week-rail"
                  style={{ flexGrow: 1, flexShrink: 1 }}
                  edgePadding={spacing[2]}
                  scrollToIndex={selectedIndex}
                  itemWidth={DAY_CELL_WIDTH}
                >
                  {weekDays(weekStart).map((day) => {
                    const count = counts[dayKey(day)] ?? 0;
                    return (
                      <DayCell
                        key={dayKey(day)}
                        weekday={formatWeekdayShort(day, locale)}
                        date={dayOfMonth(day)}
                        hasClasses={count > 0}
                        selected={isSameDay(day, selectedDay)}
                        // The dot is the ONLY thing that says a day has classes, so
                        // the whole sentence has to be spelled out here — including
                        // "Today", which is otherwise nowhere on the strip.
                        accessibilityLabel={[
                          isSameDay(day, today) ? t('member.classes.today') : null,
                          formatLongDate(day, locale),
                          plural('classes.listView.count', count),
                        ]
                          .filter((part): part is string => part !== null)
                          .join(', ')}
                        onPress={() => {
                          setSelectedDay(day);
                        }}
                        testID={`classes-day-${dayKey(day)}`}
                      />
                    );
                  })}
                </ScrollRail>
                <IconButton
                  icon="chevronRight"
                  accessibilityLabel={t('member.classes.nextWeek')}
                  onPress={() => {
                    stepWeek(1);
                  }}
                  variant="surface"
                  testID="classes-next-week"
                />
              </View>

              {facets.categories.length > 0 ? (
                <ScrollRail testID="classes-categories">
                  <Chip
                    label={t('member.classes.all')}
                    selected={filters.category === null}
                    onPress={() => {
                      setFilters((current) => ({ ...current, category: null }));
                    }}
                    testID="classes-category-all"
                  />
                  {facets.categories.map((category) => (
                    <Chip
                      key={category.name}
                      label={category.name}
                      dot={category.color}
                      selected={filters.category === category.name}
                      onPress={() => {
                        setFilters((current) => ({
                          ...current,
                          category: current.category === category.name ? null : category.name,
                        }));
                      }}
                      testID={`classes-category-${category.name}`}
                    />
                  ))}
                </ScrollRail>
              ) : null}
            </View>

            <View style={{ paddingHorizontal: layout.screenGutter, gap: layout.sectionGap }}>
              {booking.failure !== null ? <BookingFailureNotice failure={booking.failure} /> : null}

              {offline ? (
                // TODO(i18n): `common.offline.title` / `common.offline.body`. See
                // `components/auth/pending-copy.ts` — the ONE module the English
                // placeholders live in, so closing the gap is a delete plus a `t()`.
                <OfflineNotice testID="classes-offline" />
              ) : null}

              {loading ? <ClassesSkeleton label={t('member.classes.loading')} /> : null}

              {failed ? (
                <EmptyState
                  testID="classes-error"
                  icon="info"
                  title={t('member.classes.error')}
                  action={{
                    label: t('member.classes.retry'),
                    onPress: retry,
                    variant: 'secondary',
                    testID: 'classes-retry',
                  }}
                />
              ) : null}

              {ready ? (
                groups.length > 0 ? (
                  groups.map((group) => (
                    <View
                      key={group.period}
                      testID={`classes-group-${group.period}`}
                      style={{ gap: spacing[3] }}
                    >
                      <PeriodHeader
                        label={t(`member.classes.periods.${group.period}`)}
                        count={group.items.length}
                      />
                      <View style={{ gap: spacing[3] }}>
                        {group.items.map((instance) => (
                          <ClassListCard
                            key={instance.id}
                            instance={instance}
                            booking={myBookings[instance.id]}
                            busy={booking.pendingId === instance.id}
                            onOpen={openClass}
                            onAction={act}
                            testID={`classes-card-${instance.id}`}
                          />
                        ))}
                      </View>
                    </View>
                  ))
                ) : activeCount > 0 ? (
                  // Classes exist, the filters exclude them. A different question
                  // from "nothing is on today", and the only one with a one-tap fix.
                  <EmptyState
                    testID="classes-no-match"
                    icon="filter"
                    title={
                      filters.category === null
                        ? t('classes.filters.noMatch.title')
                        : t('member.classes.empty.titleFiltered', { type: filters.category })
                    }
                    body={t('classes.filters.noMatch.subtitle')}
                    action={{
                      label: t('classes.filters.noMatch.action'),
                      onPress: () => {
                        setFilters(EMPTY_FILTERS);
                      },
                      variant: 'secondary',
                      testID: 'classes-clear-filters',
                    }}
                  />
                ) : (
                  <EmptyState
                    testID="classes-empty"
                    icon="calendar"
                    title={t('member.classes.empty.title')}
                    body={t('member.classes.empty.subtitle')}
                  />
                )
              ) : null}
            </View>
          </>
        )}
      </View>

      {/* Both belong to the schedule, and both are `Modal`s — so they leave
          with their tab rather than sitting invisibly under the other one. */}
      {tab === 'classes' ? (
        <>
          <ClassFilterSheet
            open={filtersOpen}
            onClose={() => {
              setFiltersOpen(false);
            }}
            facets={facets}
            filters={filters}
            onChange={setFilters}
          />
          <ClassBookingSheet booking={booking} />
        </>
      ) : null}
    </Screen>
  );
}

/**
 * A time-of-day group's header: the label, a hairline rule, the count in mono.
 *
 * `Heading level={3} variant="eyebrow"` rather than a bare `Eyebrow`: it is a
 * heading semantically — a screen-reader user jumps between morning, afternoon
 * and evening — and the `variant` override is how the package lets a heading
 * keep the artboard's 13px small-caps setting without pretending to be a
 * section title.
 */
function PeriodHeader({ label, count }: { label: string; count: number }) {
  const colors = useThemeColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
      <Heading level={3} variant="eyebrow" color="textSecondary">
        {label}
      </Heading>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ flex: 1, height: 1, backgroundColor: colors.border }}
      />
      {/* `textSecondary`, not `textDisabled`: this is live data, and the
          disabled role measured 2.8:1 on the light surface — under AA for the
          13px it renders at. Nothing here is disabled; it just sits quietly. */}
      <Mono variant="monoCaption" color="textSecondary">
        {String(count)}
      </Mono>
    </View>
  );
}

/**
 * The loading state — card-shaped, not a spinner.
 *
 * Silent by design: one label on the section beats four on its bars, and there
 * is nothing to announce that `member.classes.loading` does not already say
 * once.
 */
function ClassesSkeleton({ label }: { label: string }) {
  return (
    <View
      testID="classes-loading"
      accessible
      accessibilityLabel={label}
      style={{ gap: spacing[3] }}
    >
      <Skeleton height={20} width={96} radius="element" />
      <Skeleton height={148} radius={30} />
      <Skeleton height={148} radius={30} />
      <Skeleton height={148} radius={30} />
    </View>
  );
}
