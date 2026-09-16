// `/trainers` — the gym's roster. PUBLIC: it renders signed out, on purpose.
//
// ===========================================================================
// COPY FAMILY: `member.trainers` (D10).
//
// The member set is the one written for this screen — it is the only one of
// the two that carries `search`, `searchPlaceholder`, `clear`, `eyebrow` and
// the `noMatch` block, i.e. exactly the mobile affordances. The top-level
// `trainers` namespace is web's, and this file borrows from it only where the
// member set is silent: `trainers.grid.label` for the roster count's spoken
// name. Every such borrow is marked at the call site.
//
// ---------------------------------------------------------------------------
// THE STATE MACHINE IS WEB'S, PLUS TWO STATES A PHONE HAS AND A BROWSER
// DOES NOT.
//
//   offline    the radio is dead. `onlineManager` PAUSES the query rather than
//              failing it (`fetchStatus: 'paused'`, `isError: false`), so
//              without this branch the screen sits on skeletons forever and
//              says nothing. Rendered STRUCTURALLY — see the TODO(i18n).
//   no tenant  no gym could be resolved at all. See `hooks/useDiscoveryGym.ts`.
//   loading    skeletons, never a bare spinner (plan §6.1).
//   error      `member.trainers.error` + a WORKING retry.
//   empty      a gym with no trainers yet.
//   no-match   trainers exist, the filters exclude them all — a DISTINCT state
//              from empty, with a one-tap reset. Web ships this and the old app
//              did not, which is how "no trainers yet" got shown to someone who
//              had simply mistyped a name.
//   ready      the roster.
//
// The retry is `invalidateQueries`, NEVER `.refetch()` — plan §7. The
// invalidation matrix is the deliverable and a screen that refetches by hand is
// a screen that can disagree with it. `invalidateQueries` refetches an active
// query, an errored one included, which is what a retry is.
//
// ---------------------------------------------------------------------------
// A ROW OPENS A SHEET, NOT A ROUTE (2026-09-09).
//
// `/trainers/:id` is gone; `components/classes/trainer-sheet.tsx` now draws the
// WHOLE profile — hero, bio, specialties, locations, schedule, reviews — and is
// what the class detail and home open too. A coach is something a member looks
// AT on the way to something else, and a pushed route takes the roster away and
// makes coming back an act; the sheet keeps the list they were scanning behind
// the scrim, filters and scroll position intact.
//
// ONE SHEET PER SCREEN (see `Sheet`'s own header), and this screen has exactly
// one. The selected card is held SEPARATELY from "is it open", because the
// sheet's title and monogram are drawn from the card and clearing it on close
// would blank the panel for the 220ms of the exit animation.
// ===========================================================================

import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TrainerCard } from '@fit/types';
import {
  AppBar,
  Button,
  Chip,
  EmptyState,
  IconButton,
  PersonRow,
  Pill,
  Screen,
  ScrollRail,
  Skeleton,
  TextField,
  spacing,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../../components/auth/notices';
import { TrainerSheet } from '../../components/classes/trainer-sheet';
import {
  EMPTY_TRAINER_FILTERS,
  applyTrainerFilters,
  deriveSpecialties,
  hasActiveTrainerFilters,
  toggleSpecialty,
  trainerInitials,
  trainerMetaLine,
  type TrainerFilterState,
} from '../../components/trainers/trainer-filters';
import { trainersQueryOptions } from '../../hooks/queries/useTrainers';
import { useDiscoveryGym } from '../../hooks/useDiscoveryGym';
import { queryKeys } from '../../lib/query-keys';
import { useI18n } from '../../providers/I18nProvider';

/** How many roster rows the loading state stands in for. */
const SKELETON_ROWS = 5;

export default function TrainersScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const gym = useDiscoveryGym();
  // The exported options factory rather than `useTrainers()`, because that hook
  // scopes itself by the SESSION's gym and this route is public. See
  // `hooks/useDiscoveryGym.ts` for the whole reasoning.
  const roster = useQuery(trainersQueryOptions(gym.gymId));

  const [filters, setFilters] = useState<TrainerFilterState>(EMPTY_TRAINER_FILTERS);

  // The coach the sheet is about, and whether it is open. Two pieces of state
  // rather than one nullable id — see the header: the card feeds the sheet's
  // title and monogram, and it has to outlive the close by one animation.
  const [sheetTrainer, setSheetTrainer] = useState<TrainerCard | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openTrainer = useCallback((card: TrainerCard) => {
    setSheetTrainer(card);
    setSheetOpen(true);
  }, []);

  const closeTrainer = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const trainers = useMemo<readonly TrainerCard[]>(
    () => roster.data?.trainers ?? [],
    [roster.data],
  );
  const specialties = useMemo(() => deriveSpecialties(trainers), [trainers]);
  const visible = useMemo(() => applyTrainerFilters(trainers, filters), [trainers, filters]);

  const retry = useCallback(() => {
    // Both halves of `failed`: the tenant lookup and the roster.
    gym.retry();
    if (gym.gymId !== null) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trainers(gym.gymId) });
    }
  }, [gym, queryClient]);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_TRAINER_FILTERS);
  }, []);

  // `paused` is the offline signal: `onlineManager` is wired to NetInfo, and a
  // query with no connection is parked rather than rejected.
  const offline = roster.isPending && roster.fetchStatus === 'paused';
  const loading = gym.isPending || (roster.isPending && !offline && gym.gymId !== null);
  const failed = gym.isError || roster.isError;

  const header = (
    <AppBar
      // The screen's one `role="header"`. Everything below is a state block,
      // not a section, so the ordered header list is exactly `['Trainers']`.
      eyebrow={t('member.trainers.eyebrow')}
      title={t('member.trainers.title')}
      leading={
        <IconButton
          icon="chevronLeft"
          // TODO(i18n): there is no namespace-neutral "Back". `checkout.back`
          // is real, translated copy ("Back" / "უკან") and renders correctly in
          // both locales; `common.back` is one of the six shared-chrome keys
          // the plan (§7, "Copy still to author") already says are owed. No
          // string is invented here.
          accessibilityLabel={t('checkout.back')}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/home');
          }}
          testID="trainers-back"
        />
      }
      trailing={
        trainers.length > 0 ? (
          <Pill
            tone="outline"
            tabular
            // TODO(i18n): `member.trainers` has no "{count} trainers" key, so
            // the count is the DATA and `trainers.grid.label` ("Trainers" /
            // "მწვრთნელები") is the noun it is counting — composed, not
            // authored. A real `member.trainers.count` plural is owed.
            accessibilityLabel={`${String(trainers.length)} ${t('trainers.grid.label')}`}
            testID="trainers-count"
          >
            {String(trainers.length)}
          </Pill>
        ) : null
      }
    />
  );

  return (
    <Screen testID="trainers-screen" header={header}>
      <View style={{ gap: spacing[4] }}>
        {/* The filter bar exists only once there is a roster to narrow — web's
            rule exactly. Offering a search field over a failed load is offering
            a control that cannot work. */}
        {trainers.length > 0 ? (
          <View style={{ gap: spacing[3] }} testID="trainers-filters">
            <TextField
              // The label is VISIBLE, not `labelHidden`, and that is a
              // constraint rather than a preference: `TextField` renders its
              // `action` slot inside the label row, so hiding the label hides
              // "Clear search" with it — and `member.trainers` ships that key
              // precisely because this screen is meant to offer it.
              label={t('member.trainers.search')}
              placeholder={t('member.trainers.searchPlaceholder')}
              startIcon="search"
              value={filters.search}
              onChangeText={(search) => {
                setFilters((current) => ({ ...current, search }));
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              testID="trainers-search"
              action={
                filters.search !== '' ? (
                  <Button
                    label={t('member.trainers.clear')}
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      setFilters((current) => ({ ...current, search: '' }));
                    }}
                    testID="trainers-search-clear"
                  />
                ) : null
              }
            />

            {specialties.length > 0 ? (
              <ScrollRail gap={2} testID="trainers-specialties">
                <Chip
                  label={t('member.trainers.all')}
                  selected={filters.specialties.length === 0}
                  onPress={clearFilters}
                  testID="trainers-specialty-all"
                />
                {specialties.map((specialty) => (
                  <Chip
                    key={specialty}
                    // A specialty is DATA, not copy — the gym types it in the
                    // admin console, in whatever language it runs in.
                    label={specialty}
                    selected={filters.specialties.includes(specialty)}
                    onPress={() => {
                      setFilters((current) => toggleSpecialty(current, specialty));
                    }}
                    testID={`trainers-specialty-${specialty}`}
                  />
                ))}
              </ScrollRail>
            ) : null}
          </View>
        ) : null}

        {offline ? (
          // §6 STATE 4. THE SKELETON WAS THE MISTAKE, NOT THE MISSING KEY.
          //
          // The reasoning that stood here was right about the copy — there are
          // ZERO `offline` keys in either catalogue — and wrong about the
          // remedy. A paused query never resolves, so this branch is where the
          // screen STAYS with a dead radio, and skeletons there promise a
          // roster that is not coming. `OfflineNotice` is the app's answer to
          // exactly that, is already rendered in this branch on eleven other
          // screens, and carries the marked English placeholder so nothing is
          // invented here either.
          //
          // TODO(i18n): `common.offline.title` / `common.offline.body` — see
          // `components/auth/pending-copy.ts`.
          <OfflineNotice testID="trainers-offline" />
        ) : null}

        {loading ? (
          <View testID="trainers-loading" style={{ gap: spacing[3] }}>
            <RosterSkeleton />
          </View>
        ) : null}

        {!offline && !loading && failed ? (
          // `EmptyState` IS the error state (WP-8b, plan item G-05): no artboard
          // draws a failed load, and a toast is never one because it
          // auto-dismisses. `icon="info"` — there is no warning triangle in the
          // 60-glyph dictionary and adding one is a WP-5 change.
          <EmptyState
            testID="trainers-error"
            icon="info"
            title={t('member.trainers.error')}
            action={{
              label: t('member.trainers.retry'),
              onPress: retry,
              variant: 'secondary',
              icon: 'refresh',
              testID: 'trainers-retry',
            }}
          />
        ) : null}

        {!offline && !loading && !failed && trainers.length === 0 ? (
          <EmptyState
            testID="trainers-empty"
            icon="users"
            title={t('member.trainers.empty.title')}
            body={t('member.trainers.empty.subtitle')}
          />
        ) : null}

        {!offline && !loading && !failed && trainers.length > 0 && visible.length === 0 ? (
          <EmptyState
            testID="trainers-no-match"
            icon="search"
            title={t('member.trainers.noMatch.title')}
            body={t('member.trainers.noMatch.subtitle')}
            {...(hasActiveTrainerFilters(filters)
              ? {
                  action: {
                    label: t('member.trainers.noMatch.action'),
                    onPress: clearFilters,
                    variant: 'secondary' as const,
                    testID: 'trainers-clear-filters',
                  },
                }
              : {})}
          />
        ) : null}

        {!offline && !loading && !failed && visible.length > 0 ? (
          <View style={{ gap: spacing[3] }} testID="trainers-list">
            {visible.map((trainer) => (
              <PersonRow
                key={trainer.id}
                name={trainer.name}
                {...(trainer.headline ? { eyebrow: trainer.headline } : {})}
                {...(trainerMetaLine(trainer) ? { meta: trainerMetaLine(trainer) } : {})}
                {...(trainer.avatarUrl ? { avatarSource: { uri: trainer.avatarUrl } } : {})}
                initials={trainerInitials(trainer.name)}
                action={{
                  kind: 'icon',
                  icon: 'chevronRight',
                  // The trainer's NAME is the accessible name of "open this
                  // trainer", and it is data rather than copy — which is why
                  // this needs no key. The row itself is not pressable (a
                  // button inside a button gives a screen-reader user two stops
                  // that do different things), so this control is the only way
                  // in and must say where it goes.
                  accessibilityLabel: trainer.name,
                  onPress: () => {
                    openTrainer(trainer);
                  },
                  testID: `trainer-open-${trainer.id}`,
                }}
                testID={`trainer-row-${trainer.id}`}
              />
            ))}
          </View>
        ) : null}

        {/* The screen's ONE sheet. It renders on past `sheetOpen` going false
            so the panel has something to animate out. */}
        {sheetTrainer !== null ? (
          <TrainerSheet
            gymId={gym.gymId}
            trainerId={sheetOpen ? sheetTrainer.id : null}
            name={sheetTrainer.name}
            avatarUrl={sheetTrainer.avatarUrl}
            onClose={closeTrainer}
            testID="trainer-sheet"
          />
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * The roster's loading placeholder.
 *
 * Silent by design: one section label would be better than five, and there is
 * no `member.trainers.loading` sentence worth announcing that the skeletons do
 * not already imply. (`member.trainers.loading` DOES exist — "Loading
 * trainers…" — but it is web's status paragraph, which replaces the list; the
 * artboards' loading state is a skeleton, per plan §6.1.)
 */
function RosterSkeleton() {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} height={84} radius={26} />
      ))}
    </>
  );
}
