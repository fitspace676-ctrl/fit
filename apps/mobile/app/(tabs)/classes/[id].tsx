// Class detail. `mobile-class-detail.tsx`, on `GET /class-instances/:id`.
//
// ===========================================================================
// `auth-soft`: THE PAGE READS SIGNED OUT, THE BUTTON DOES NOT.
//
// `ROUTE_POLICY` has `'(tabs)/classes/[id]': 'auth-soft'` — "renderable signed
// out, but its primary action is not". So a visitor who followed a link sees
// the class, the coach, the room and how full it is; the sticky bar says
// `classes.modal.signInToBook` and hands the guard a `next=` back to THIS
// class. That is what `auth-soft` is for, and it is the flow C3's demo is:
// browse signed out, hit the prompt at the CTA, sign in, land back, book.
//
// ---------------------------------------------------------------------------
// SIX BRANCHES, AND TWO OF THEM ARE NOT ERRORS.
//
//   loading      section-shaped skeletons.
//   offline      `onlineManager` PAUSES a query rather than failing it, so with
//                a dead radio and a cold cache the query sits `isPending`
//                forever and the error box never fires. TODO(i18n): there are
//                ZERO `offline` keys in either catalogue, so this renders the
//                one marked English placeholder the auth screens already share.
//   not-found    a 404 is its OWN state, with real copy
//                (`classes.detail.notFound.*`) and a route back to the
//                schedule — not the generic error box. A shared link outlives
//                the class it points at more often than anything else here.
//   error        `EmptyState` + a working retry — `invalidateQueries`, never
//                `.refetch()`.
//   canceled /   `classInstanceDetailSchema` carries `status` precisely so a
//   completed    stale link degrades to a banner instead of a confusing 404.
//                The class still renders; the sticky bar does not, because
//                there is nothing to book.
//   ready        the hero, the meter, the facts, the description, the coach.
//
// ---------------------------------------------------------------------------
// LIVE OCCUPANCY IS C6's, NOT THIS SCREEN'S.
//
// `classOccupancyStreamUrl` exists and `react-native-sse` is in the dep set,
// and NEITHER is touched here. The meter renders from the query, and the
// mutations' invalidation matrix is what moves it after a booking. Opening an
// `EventSource` now would be a second source of truth for `bookedCount` with
// no reconnection story.
//
// ---------------------------------------------------------------------------
// THE THRESHOLDS ARE ASKED FOR, NEVER RE-DERIVED.
//
// `occupancyTone(booked, capacity)` and `OCCUPANCY_TONE_ROLE` are exported by
// the package because the >=100 / >85 / else split appears in three places in
// the design; the tinted "3 spots left" line beside the meter makes the same
// call the meter itself does. Likewise `spotsLeftFor` / `isClassFull`: the
// screen asks for the number only to interpolate it into copy.
//
// Copy is `classes.detail` (+ `classes.modal`) per D10 — `member.classes` has
// no `detail` block at all.
// ===========================================================================

import { useCallback, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClassInstanceDetail } from '@fit/types';
import {
  Alert,
  AppBar,
  Button,
  ClassCard,
  EmptyState,
  Eyebrow,
  FactTile,
  IconButton,
  Mono,
  OCCUPANCY_TONE_ROLE,
  OccupancyMeter,
  PersonRow,
  SCREEN_GUTTER,
  Screen,
  SectionHeader,
  Skeleton,
  Surface,
  Text,
  TileGrid,
  capsuleMetricsFor,
  isClassFull,
  layout,
  occupancyTone,
  spacing,
  spotsLeftFor,
  type ClassCardStatus,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import { BookingFailureNotice } from '../../../components/classes/booking-notice';
import { ClassBookingSheet } from '../../../components/classes/booking-sheet';
import {
  NO_BOOKING,
  bookingsByClassId,
  myBookingsPhase,
} from '../../../components/classes/my-bookings';
import { ClassTrainerSheet } from '../../../components/classes/trainer-sheet';
import { combinePhases, sectionPhase, type SectionPhase } from '../../../components/home/section';
import { formatLongDay, formatTime } from '../../../components/classes/schedule';
import { useClassBooking } from '../../../components/classes/use-class-booking';
import { trainerInitials } from '../../../components/trainers/trainer-filters';
import { useMyBookings } from '../../../hooks/queries/useBookings';
import { classQueryOptions } from '../../../hooks/queries/useClasses';
import { useDiscoveryGym } from '../../../hooks/useDiscoveryGym';
import { useGymId } from '../../../hooks/useActiveGym';
import { useSession } from '../../../hooks/useSession';
import { ApiError } from '../../../lib/http/api-error';
import { queryKeys } from '../../../lib/query-keys';
import { useI18n } from '../../../providers/I18nProvider';

export default function ClassDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const session = useSession();

  // A deep link resolves its param asynchronously, so this is briefly absent —
  // which `classQueryOptions` treats as a disabled query rather than as a
  // request for `/class-instances/`.
  const { id } = useLocalSearchParams<{ id?: string }>();
  const classId = typeof id === 'string' && id !== '' ? id : null;

  const gym = useDiscoveryGym();
  const booking = useClassBooking();
  // The SESSION's gym — what `useMyBookings` scopes itself by, and therefore
  // what decides whether that query is enabled at all.
  const sessionGymId = useGymId();

  const detail = useQuery(classQueryOptions(gym.gymId, classId));
  // Disabled while signed out (no session gym) — the public detail needs no
  // member state, and firing this without a token would be a guaranteed 401.
  const bookings = useMyBookings('upcoming');

  const instance = detail.data?.instance ?? null;
  const mine =
    (classId === null ? undefined : bookingsByClassId(bookings.data)[classId]) ?? NO_BOOKING;

  // =========================================================================
  // TWO SHEETS ON ONE SCREEN, AND NEVER BOTH OPEN.
  //
  // `Sheet`'s header states the rule and the remedy: two `Modal`s whose
  // `visible` overlaps for one frame flash black on iOS, and the exclusion
  // belongs to the SCREEN. Its worked example is one `useState<'qr' |
  // 'filters' | null>` — but the booking sheet is not screen state at all: it
  // is `useClassBooking`'s `target`, which also carries the idempotency key,
  // the in-flight guard and the sign-in bounce, and folding that into a local
  // union would mean teaching the flow about a sheet it has nothing to do with.
  //
  // So there are two pieces of state and ONE invariant, held in one place:
  // opening the trainer sheet dismisses the booking flow, requesting a booking
  // clears the trainer, and the trainer sheet's `open` is additionally *derived*
  // through `booking.target === null` — so even a path that forgot both handlers
  // cannot get two panels up at once. (`dismiss()` is a no-op while a write is
  // in flight, which is exactly right: that sheet is not dismissable, and its
  // own scrim means the row underneath cannot be pressed anyway.)
  // =========================================================================
  const [trainerSheetId, setTrainerSheetId] = useState<string | null>(null);

  const openTrainer = useCallback(
    (trainerId: string) => {
      booking.dismiss();
      setTrainerSheetId(trainerId);
    },
    [booking],
  );

  const closeTrainer = useCallback(() => {
    setTrainerSheetId(null);
  }, []);

  const back = useCallback(() => {
    // A cold launch on `fit://classes/<id>` has nothing to pop.
    if (router.canGoBack()) router.back();
    else router.replace('/classes');
  }, [router]);

  const retry = useCallback(() => {
    gym.retry();
    if (gym.gymId !== null && classId !== null) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.classDetail(gym.gymId, classId) });
    }
    // The member's own seats are half of what the sticky bar renders, so they
    // are half of what a retry has to re-read.
    if (sessionGymId !== null) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings(sessionGymId) });
    }
  }, [classId, gym, queryClient, sessionGymId]);

  const notFound =
    ApiError.is(detail.error) && (detail.error.status === 404 || detail.error.code === 'NOT_FOUND');
  const paused = detail.fetchStatus === 'paused' && detail.data === undefined;
  const offline = !online || paused;

  // =========================================================================
  // THE STICKY BAR IS A JOIN, SO THE SCREEN'S PHASE IS ONE — `combinePhases`.
  //
  // `GET /class-instances/:id` is `@Public()` and carries NO member state; the
  // seat comes from `GET /me/bookings`. Gating on the detail alone meant that
  // when `/me/bookings` failed, `bookingsByClassId(undefined)` returned `{}`,
  // `mine` fell back to `NO_BOOKING`, and the bar said **Book** for a class the
  // member is already on — answered by `409 ALREADY_BOOKED`.
  //
  // Home refuses exactly this with `combinePhases` and says why; this is the
  // same guard. `myBookingsPhase` carries the signed-out case, where the query
  // is disabled and "no bookings" is the truth rather than a gap.
  // =========================================================================
  const gymPhase: SectionPhase = gym.isError ? 'error' : gym.isPending ? 'loading' : 'ready';
  const screenPhase = combinePhases(
    gymPhase,
    sectionPhase(detail, online),
    myBookingsPhase(bookings, online, sessionGymId !== null),
  );

  const loading = classId !== null && !offline && screenPhase === 'loading';
  const failed = !offline && !notFound && screenPhase === 'error';
  const ready = !offline && !notFound && screenPhase === 'ready';

  return (
    <Screen
      testID="class-detail-screen"
      // Off because `AppBar` and every section apply their own; kept consistent
      // with the list screen next door.
      gutter={false}
      header={
        <AppBar
          gutter
          leading={
            <IconButton
              icon="chevronLeft"
              accessibilityLabel={t('classes.detail.back')}
              onPress={back}
              testID="class-back"
            />
          }
          // The artboard's SHARE button is deliberately absent. Neither
          // catalogue carries a "Share" string, and `IconButton` takes
          // `accessibilityLabel` as a REQUIRED prop — so an unlabelled icon
          // button is not even expressible. Owed with the shared-chrome keys.
          title={instance?.title ?? t('member.classes.title')}
        />
      }
      footer={
        // `ready`, not merely "the class arrived": the bar's LABEL is the join's
        // answer, so a bar drawn while the bookings half is unknown is the lie
        // this screen exists to stop telling.
        ready && instance !== null && instance.status === 'SCHEDULED' ? (
          <BookingBar
            instance={instance}
            status={mine.status}
            signedIn={session.status === 'signed-in'}
            busy={booking.pendingId === instance.id}
            onPress={() => {
              // Half of the one-sheet invariant — see the note by
              // `trainerSheetId`.
              setTrainerSheetId(null);
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
            }}
          />
        ) : null
      }
    >
      <View style={{ paddingHorizontal: layout.screenGutter, gap: layout.sectionGap }}>
        {booking.failure !== null ? <BookingFailureNotice failure={booking.failure} /> : null}

        {offline ? (
          // TODO(i18n): `common.offline.title` / `common.offline.body` — see
          // `components/auth/pending-copy.ts`, the one module the English
          // placeholders live in.
          <OfflineNotice testID="class-detail-offline" />
        ) : null}

        {loading ? <DetailSkeleton /> : null}

        {!loading && !offline && notFound ? (
          <EmptyState
            testID="class-detail-not-found"
            icon="calendar"
            title={t('classes.detail.notFound.title')}
            body={t('classes.detail.notFound.subtitle')}
            action={{
              label: t('classes.detail.notFound.action'),
              onPress: back,
              variant: 'secondary',
              testID: 'class-detail-back-to-classes',
            }}
          />
        ) : null}

        {failed ? (
          <EmptyState
            testID="class-detail-error"
            icon="info"
            title={t('classes.error')}
            action={{
              label: t('classes.retry'),
              onPress: retry,
              variant: 'secondary',
              testID: 'class-detail-retry',
            }}
          />
        ) : null}

        {ready && instance !== null ? (
          <ClassBody
            instance={instance}
            status={mine.status}
            waitlistPosition={mine.waitlistPosition}
            onOpenTrainer={openTrainer}
          />
        ) : null}
      </View>

      <ClassBookingSheet booking={booking} />
      <ClassTrainerSheet
        gymId={gym.gymId}
        // Derived, not just set: the booking flow wins outright, so the two
        // `open` props above and here can never both be true.
        trainerId={booking.target === null ? trainerSheetId : null}
        name={instance?.trainerName ?? ''}
        avatarUrl={instance?.trainerAvatarUrl ?? null}
        // No `onOpenProfile`: `/trainers/[id]` is gone, so the sheet IS the
        // coach's profile. Handing it a push to a route that no longer exists
        // is how the "see full profile" row used to dead-end.
        onClose={closeTrainer}
      />
    </Screen>
  );
}

/** Everything below the app bar once the class has loaded. */
function ClassBody({
  instance,
  status,
  waitlistPosition,
  onOpenTrainer,
}: {
  instance: ClassInstanceDetail;
  status: ClassCardStatus;
  waitlistPosition: number | null;
  /** Open the coach's sheet. Called only when the class HAS a trainer id. */
  onOpenTrainer: (trainerId: string) => void;
}) {
  const { t, plural, locale } = useI18n();

  const spotsLeft = spotsLeftFor(instance.capacity, instance.bookedCount);
  const full = isClassFull(instance.capacity, instance.bookedCount);
  const tone = occupancyTone(instance.bookedCount, instance.capacity);
  const seats = full ? t('classes.card.full') : plural('classes.card.spotsLeft', spotsLeft);
  const duration = plural('classes.detail.minutes', instance.durationMinutes);
  const day = formatLongDay(instance.startsAt, locale);
  const starts = formatTime(instance.startsAt, locale);

  // The member's OWN standing in this class — booked, waitlisted, or a place in
  // the queue. It used to be the sticky bar's left-hand column; the bar is now
  // exactly as tall as the nav capsule and has room for the commitment only
  // (see `BookingBar`), so the sentence moved here, to the panel that is
  // already about who holds a seat. `null` for a member who holds neither.
  // A `const`, so the narrowing survives into the press handler's closure.
  const trainerId = instance.trainerId;

  // The identity half of the coach's row — the same in both arms below, so the
  // pressable one cannot drift from the inert one.
  const trainerRow = {
    testID: 'class-trainer',
    eyebrow: t('classes.detail.trainer'),
    name: instance.trainerName,
    // Locale-specific, so `Avatar` cannot derive it — see its own note.
    initials: trainerInitials(instance.trainerName),
    ...(instance.trainerAvatarUrl === null
      ? {}
      : { avatarSource: { uri: instance.trainerAvatarUrl } }),
    ...(instance.locationName === '' ? {} : { meta: instance.locationName }),
  } as const;

  const standing =
    status === 'BOOKED'
      ? t('classes.detail.booking.bookedTitle')
      : status === 'WAITLIST'
        ? waitlistPosition === null
          ? t('classes.detail.booking.waitlistedTitle')
          : t('classes.detail.booking.waitlistPosition', { position: waitlistPosition })
        : null;

  return (
    <>
      {instance.status === 'SCHEDULED' ? null : (
        <Alert
          testID="class-detail-status"
          tone="warning"
          icon="info"
          title={t(
            instance.status === 'CANCELED'
              ? 'classes.detail.status.canceled'
              : 'classes.detail.status.completed',
          )}
        />
      )}

      {/* `hero`: radius 32, pad 24, title 34, NO duration disc, NO spots pill
          and NO inline action — the occupancy is its own section below and the
          CTA is the sticky bar. */}
      <ClassCard
        testID="class-hero"
        variant="hero"
        category={instance.category}
        categoryColor={instance.color}
        title={instance.title}
        // THE PHOTO HERO the parity audit deferred for want of data. The data
        // exists: `classInstanceDetailSchema` extends the card schema, so the
        // detail inherits `imageUrl` and the service populates it. Null on most
        // classes, and null is this header exactly as it was.
        coverImageUrl={instance.imageUrl}
        time={`${starts}–${formatTime(instance.endsAt, locale)}`}
        meta={day}
        duration={{
          value: String(instance.durationMinutes),
          // The unit alone, split out of a whole phrase — see
          // `components/classes/class-list-card.tsx` for why, and the report
          // for the key that is owed.
          unit: t('member.classes.minutes', { count: '' }).trim(),
          accessibilityLabel: duration,
        }}
        capacity={instance.capacity}
        bookedCount={instance.bookedCount}
        accessibilityLabel={[instance.title, instance.category, day, starts, seats]
          .filter((part) => part !== '')
          .join(', ')}
      />

      <Surface
        testID="class-occupancy-panel"
        tone="card"
        radius="container"
        padding={5}
        style={{ gap: spacing[4] }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: spacing[3],
          }}
        >
          {/* ONE node, not four. Split into its visible parts a screen reader
              reads "Capacity", then "two zero", then "slash two four" — the
              figures spelled digit by digit because they are tabular mono. */}
          <View accessible accessibilityLabel={`${t('classes.detail.capacity')}: ${seats}`}>
            <Eyebrow accessible={false}>{t('classes.detail.capacity')}</Eyebrow>
            <View
              accessible={false}
              style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: spacing[2] }}
            >
              <Mono variant="monoDisplay">{String(instance.bookedCount)}</Mono>
              <Mono variant="monoLarge" color="textSecondary">
                {`/${String(instance.capacity)}`}
              </Mono>
            </View>
          </View>
          {/* The same tone the meter draws itself with — asked for, never
              re-derived. See the header. */}
          <Text variant="bodySmall" color={OCCUPANCY_TONE_ROLE[tone]} testID="class-spots">
            {seats}
          </Text>
        </View>
        <OccupancyMeter
          testID="class-occupancy"
          booked={instance.bookedCount}
          capacity={instance.capacity}
          accessibilityLabel={t('classes.detail.capacity')}
          accessibilityValueText={seats}
        />
        {standing === null ? null : (
          <Text testID="class-booking-line" variant="bodySmall" color="accent">
            {standing}
          </Text>
        )}
      </Surface>

      {/* =====================================================================
          THE COACH, WITH A FACE, AND PRESSABLE WHEN THERE IS SOMEONE TO OPEN.

          This row was inert and said so: the detail carried `trainerName` as a
          denormalised STRING and no id, so there was nothing to route to. The
          contract now carries `trainerId` and `trainerAvatarUrl`, so the row
          draws the portrait it was always shaped for (monogram when the coach
          has no photo, which is most of them) and opens `ClassTrainerSheet`.

          `trainerId` is nullable and a null one is a REAL state — a template
          with a coach's name typed in and no staff record behind it. That row
          stays inert rather than pressable-and-dead, which is what `PersonRow`'s
          own union enforces: `onPress` is not passed at all.

          A SHEET, NOT A PUSH. The member is mid-decision on a class; sending
          them to a full profile screen costs them the booking bar and the back
          stack. The sheet answers "who is this?" over the class, and offers the
          profile as its one action.

          IT SITS ABOVE THE FACTS, AND THE FACTS NO LONGER REPEAT IT. The row
          used to live under the description with a `user` fact tile saying the
          same name four hundred points above it — the same fact twice, and the
          pressable, portrait-bearing copy was the one you had to scroll for.
          The person comes first, the four remaining facts about the occurrence
          come second, and `class-fact-trainer` is gone rather than duplicated.
      ===================================================================== */}
      {instance.trainerName === '' ? null : trainerId === null ? (
        <PersonRow {...trainerRow} />
      ) : (
        <PersonRow
          {...trainerRow}
          onPress={() => {
            onOpenTrainer(trainerId);
          }}
          // The row announces ONCE, as what it is for. `PersonRow` requires the
          // name because it is copy; the hint is what the press does.
          accessibilityLabel={`${t('classes.detail.trainer')}: ${instance.trainerName}`}
          accessibilityHint={t('classes.detail.trainerSheet.hint')}
        />
      )}

      {/* =====================================================================
          THREE FACTS: A PAIR, THEN ONE ACROSS.

          Losing the trainer tile left an ODD number, and none of `TileGrid`'s
          own answers to that survives being looked at on the device:

            columns={2}   pads the short row with a SPACER, by design — and a
                          2×2 grid missing its bottom-right corner reads as a
                          tile that failed to load, not as a deliberate three.
            columns={3}   fits, and then breaks. At (350 − 2×12) / 3 = 109pt a
                          tile has 77pt of text: "ხანგრძლივობა" hyphenates
                          MID-WORD, "Rustaveli Flagship" takes two lines, and
                          because `FactTile` sizes to its content the three
                          tiles come out at three different heights.

          So the pair keeps the artboard's `grid-cols-2 gap-3` and the leftover
          goes full width under it, at the same 12pt gutter. `TileGrid`'s header
          warns that a stretched tile "stops reading as a member of the grid and
          starts reading as a banner" — which is exactly why the ROOM is the one
          that moves: it is the least of the three (an em dash on most classes),
          so a wide plate under two square ones reads as the tail of a list
          rather than as something being announced.
      ===================================================================== */}
      <View testID="class-facts" style={{ gap: spacing[3] }}>
        <TileGrid columns={2}>
          <FactTile
            icon="pin"
            label={t('classes.detail.location')}
            value={instance.locationName === '' ? EMPTY_FACT : instance.locationName}
            testID="class-fact-location"
          />
          <FactTile
            icon="clock"
            label={t('classes.detail.duration')}
            value={duration}
            testID="class-fact-duration"
          />
        </TileGrid>
        <FactTile
          icon="users"
          label={t('classes.detail.room')}
          value={instance.room === '' ? EMPTY_FACT : instance.room}
          testID="class-fact-room"
        />
      </View>

      {instance.description === '' ? null : (
        <View testID="class-about" style={{ gap: spacing[3] }}>
          <SectionHeader title={t('classes.detail.about')} />
          <Text variant="body" color="textSecondary">
            {instance.description}
          </Text>
        </View>
      )}
    </>
  );
}

/**
 * What a fact tile shows when the template has no location / room.
 *
 * An em dash, not a translated "None": the API models "unset" as an empty
 * string, the tile's label already says which fact is missing, and a dash is
 * the same glyph in both locales. `FactTile` announces `"${label}: —"`.
 */
const EMPTY_FACT = '—';

/**
 * The sticky bar. Outside the scroll — that is what `Screen`'s `footer` is —
 * so the commitment is reachable without scrolling past a long description.
 *
 * ===========================================================================
 * IT IS THE NAV CAPSULE, ONE ROW UP.
 *
 * The bar and the floating tab bar are the only two objects on this screen
 * that float, and `Screen` pins them 12pt apart (`FOOTER_GAP`) — so they are
 * read as a pair whether or not they were drawn as one. They were not: the
 * capsule is `capsuleMetricsFor(width).height` tall (72, or 60 on a small
 * device), a full pill, inset by `SCREEN_GUTTER`; the bar was content-height,
 * radius 26, and edge-to-edge, because `Screen` gutters its footer only when
 * its own `gutter` is on and this screen turns it off. Two floating slabs of
 * different width and different silhouette, stacked.
 *
 * So the geometry is ASKED FOR rather than transcribed — the same
 * `capsuleMetricsFor` call `FloatingTabBar` makes, `height / 2` for the pill
 * (via `Surface`'s `side` clamp), `SCREEN_GUTTER` for the inset, and the
 * capsule's own `padding` inside. Change the capsule and the bar moves with it.
 *
 * AND THAT HEIGHT IS A BUDGET, WHICH IS WHY THE CAPACITY COLUMN IS GONE.
 * 72 − 2 × 8 leaves 56 for content and the `lg` CTA is 52 of it, so an eyebrow
 * plus a count no longer fits beside the button in EITHER locale — and the old
 * "let the row wrap" answer (which existed because the Georgian CTA is 224pt
 * against English's 150) needs a height this bar no longer has. Nothing is
 * lost: the seat count is `class-occupancy-panel` directly above, which is
 * where it was already, and the member's own standing renders there too.
 * ===========================================================================
 */
function BookingBar({
  instance,
  status,
  signedIn,
  busy,
  onPress,
}: {
  instance: ClassInstanceDetail;
  status: ClassCardStatus;
  signedIn: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();

  // The tab bar's own metrics, at the tab bar's own default count. The bar
  // holds no items, so only `height` and `padding` are read — but taking them
  // from the same function is the whole point.
  const capsule = capsuleMetricsFor(width);

  const full = isClassFull(instance.capacity, instance.bookedCount);

  const label = !signedIn
    ? t('classes.modal.signInToBook')
    : status === 'WAITLIST'
      ? t('classes.detail.booking.leaveWaitlist')
      : status === 'BOOKED'
        ? t('classes.detail.booking.cancel')
        : full
          ? t('classes.detail.booking.joinWaitlist')
          : // `bookShort`, not `book`. "Book this class" / "გაკვეთილის
            // დაჯავშნა" is still what the confirm sheet and the web modal say,
            // where the sentence has a recap under it to belong to; on a bar
            // that is nothing BUT this button, under a hero titled with the
            // class, naming the class again is the second half of a sentence
            // the screen already said.
            t('classes.detail.booking.bookShort');

  return (
    <Surface
      testID="class-booking-bar"
      tone="card"
      // A pill, by the same arithmetic the capsule rounds itself with: `full`
      // clamped to `floor(height / 2)`.
      radius="full"
      side={capsule.height}
      // The capsule's material as well as its shape. Both float over the same
      // scrolling page and a shadow is what says so.
      shadow="float"
      style={{
        height: capsule.height,
        justifyContent: 'center',
        padding: capsule.padding,
        // `Screen` gutters its footer only when its own `gutter` is on, and
        // this screen turns it off (`AppBar` and every section apply their
        // own). So the bar takes the capsule's inset itself, from the same
        // constant `FloatingTabBar` pads with.
        marginHorizontal: SCREEN_GUTTER,
      }}
    >
      {/* `fullWidth` INSIDE the plate, the way the capsule's active lime disc
          sits inside the capsule: 52pt of button in 56pt of box, concentric
          pills. `radius="full"` on the button because an `element` radius (14)
          inside a 36 pill reads as a rectangle someone forgot to round. */}
      <Button
        testID="class-book"
        label={label}
        onPress={onPress}
        size="lg"
        radius="full"
        fullWidth
        variant={status === null ? 'primary' : 'secondary'}
        busy={busy}
        busyLabel={
          status === null
            ? t('classes.detail.booking.booking')
            : t('classes.detail.booking.canceling')
        }
      />
    </Surface>
  );
}

/** Section-shaped skeletons: hero, meter, facts. Never a bare spinner. */
function DetailSkeleton() {
  const { t } = useI18n();
  return (
    <View
      testID="class-detail-loading"
      accessible
      accessibilityLabel={t('classes.loading')}
      style={{ gap: spacing[4] }}
    >
      <Skeleton height={196} radius="page" />
      <Skeleton height={104} radius="container" />
      <Skeleton height={132} radius="container" />
    </View>
  );
}
