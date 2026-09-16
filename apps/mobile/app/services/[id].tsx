// `/services/:id` — one service, its free slots, and booking one. AUTH-SOFT.
//
// ===========================================================================
// THERE IS NO `GET /services/:id`. THE DETAIL PAGE READS THE CATALOGUE.
//
// `apps/api` exposes `GET /services?gymId` and nothing narrower, so both
// surfaces fetch the whole (ACTIVE-only, small) catalogue and find the id in
// it. Web does the same and calls `notFound()` when the find misses. On the
// phone that has a real upside: arriving from `/services` the answer is
// already in the cache under the SAME key, so the detail paints instantly and
// revalidates behind the member.
//
// A missed find is therefore "not in this gym's ACTIVE catalogue" — an
// archived service, or another tenant's id — and gets its own branch. It is
// NOT an error and must not offer a retry, because retrying fetches the same
// list and misses again.
//
// ---------------------------------------------------------------------------
// THREE SECTIONS AND THEIR OWN STATES, NEVER ONE PAGE SPINNER:
//
//   the service      from the catalogue query
//   your sessions    `/me/service-sessions`, SIGNED IN ONLY — hidden, not
//                    prompted, when signed out (see `my-sessions.tsx`)
//   pick a slot      `/service-sessions`, its own week window and its own
//                    error + retry (see `slot-calendar.tsx`)
//
// ---------------------------------------------------------------------------
// BOOKING RAISES AN INVOICE. `bookServiceSession` invalidates `membership`
// alongside the slots and the session list, because the member's invoice
// history is part of `GET /me/subscription` — that is already in the matrix and
// this screen does not repeat it. What the screen DOES add is the invalidation
// for the path the matrix cannot cover: a LOST RACE, where the mutation failed
// and therefore invalidated nothing, yet the slot list is provably stale
// (someone else just took one).
// ===========================================================================

import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServiceSlot } from '@fit/types';
import {
  AppBar,
  Avatar,
  EmptyState,
  IconButton,
  Money,
  Pill,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
  spacing,
  useToast,
} from '@fit/ui-mobile';

import {
  BookingSheet,
  isSlotTaken,
  useBookingSheetState,
} from '../../components/services/booking-sheet';
import { OfflineNotice } from '../../components/auth/notices';
import { useIsOnline } from '../../components/auth/use-online';
import { sectionPhase } from '../../components/home/section';
import { formatMoney } from '../../components/services/money';
import { MySessions } from '../../components/services/my-sessions';
import { serviceTitle } from '../../components/services/service-card';
import { SlotCalendar } from '../../components/services/slot-calendar';
import { trainerInitials } from '../../components/trainers/trainer-filters';
import { useBookServiceSession } from '../../hooks/mutations/useServiceSessionMutations';
import { RESOURCE_ROOTS } from '../../hooks/mutations/invalidation';
import {
  SERVICES_KEY_GAP,
  myServiceSessionsQueryOptions,
  servicesQueryOptions,
} from '../../hooks/queries/useServices';
import { useGymId } from '../../hooks/useActiveGym';
import { useDiscoveryGym } from '../../hooks/useDiscoveryGym';
import { queryKeys } from '../../lib/query-keys';
import { useIsSignedIn } from '../../hooks/useSession';
import { useI18n } from '../../providers/I18nProvider';

/** The staff portrait in the hero. */
const HERO_AVATAR = 64;

export default function ServiceDetailScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const params = useLocalSearchParams<{ id?: string }>();
  const serviceId = typeof params.id === 'string' ? params.id : null;

  const gym = useDiscoveryGym();
  const online = useIsOnline();
  const signedIn = useIsSignedIn();
  // `/me/service-sessions` is `ClassBook` — it NEEDS a session, so it is
  // correctly scoped by the session's own gym rather than by the public one.
  const sessionGymId = useGymId();

  const catalogue = useQuery(servicesQueryOptions(gym.gymId));
  const mine = useQuery({
    ...myServiceSessionsQueryOptions(sessionGymId),
    enabled: signedIn && sessionGymId !== null,
  });

  const book = useBookServiceSession();
  const sheet = useBookingSheetState();

  const service = useMemo(
    () => catalogue.data?.services.find((candidate) => candidate.id === serviceId),
    [catalogue.data, serviceId],
  );

  const mySessions = useMemo(
    () => (mine.data?.sessions ?? []).filter((session) => session.serviceId === serviceId),
    [mine.data, serviceId],
  );

  /**
   * "Your sessions" has its own phase, because it has its own query.
   *
   * `mine` failing used to leave `mySessions` as `[]`, which `MySessions` drew
   * as "nothing booked" by rendering nothing at all — so a member who had just
   * booked a slot lost the only receipt in the app the moment the toast
   * dismissed. The section reports the failure and offers a retry instead, the
   * way `app/(tabs)/profile/bookings.tsx` does for the same query.
   */
  const sessionsPhase = sectionPhase(mine, online);

  const offline = catalogue.isPending && catalogue.fetchStatus === 'paused';
  const loading = gym.isPending || (catalogue.isPending && !offline && gym.gymId !== null);
  const failed = gym.isError || catalogue.isError;
  const missing = !offline && !loading && !failed && service === undefined;

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/services');
  }, [router]);

  const retry = useCallback(() => {
    // The tenant lookup is half of what `failed` covers, so it is half of what
    // the retry re-reads. `gym.retry()` owns the `gymBySlug` key now — the
    // screen no longer has to know it exists.
    gym.retry();
    if (gym.gymId !== null) {
      // `SERVICES_KEY_GAP` as-is — `lib/query-keys.ts` has no `services` entry
      // and promoting it is that file owner's follow-up (plan §7), not this
      // screen's to invent.
      void queryClient.invalidateQueries({ queryKey: SERVICES_KEY_GAP(gym.gymId) });
    }
  }, [gym, queryClient]);

  /**
   * Re-read the member's own sessions.
   *
   * `RESOURCE_ROOTS`-style: the two-segment root, derived from the factory, so
   * every filter bucket goes with it rather than only the one this screen
   * happens to hold. Never `.refetch()`.
   */
  const retryMine = useCallback(() => {
    if (sessionGymId === null) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.myServiceSessions(sessionGymId).slice(0, 2),
    });
  }, [queryClient, sessionGymId]);

  const confirmBooking = useCallback(
    (slot: ServiceSlot) => {
      book.mutate(
        { sessionId: slot.id },
        {
          onSuccess: () => {
            sheet.close();
            // The success sentence the catalogue already has. The booked
            // session, its invoice number and its PENDING status appear in
            // "Your sessions" below, which `bookServiceSession` has just
            // invalidated — so the toast does not have to carry the receipt.
            toast.success(t('services.booking.bookedTitle'));
          },
          onError: (error: unknown) => {
            if (isSlotTaken(error)) {
              // THE RACE. Not a dead end: close the sheet, say what happened,
              // and put the member back on a calendar that no longer shows the
              // slot they just lost. The mutation invalidated nothing because
              // it FAILED, so the refresh is explicit here — `RESOURCE_ROOTS`
              // rather than a hand-written key, so it stays derived from the
              // factory.
              sheet.close();
              toast.error(t('services.booking.errors.taken'));
              if (gym.gymId !== null) {
                void queryClient.invalidateQueries({
                  queryKey: RESOURCE_ROOTS.serviceSlots(gym.gymId),
                });
              }
              return;
            }
            // Everything else stays in the sheet, beside a re-enabled confirm.
            sheet.setError(error);
          },
        },
      );
    },
    [book, sheet, toast, t, queryClient, gym.gymId],
  );

  const signInForBooking = useCallback(() => {
    sheet.close();
    // `next=` returns them to THIS service once they are in — the whole point
    // of the `auth-soft` policy.
    const next = serviceId === null ? '/services' : `/services/${serviceId}`;
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }, [router, serviceId, sheet]);

  const title =
    service === undefined
      ? t('services.title')
      : serviceTitle(service, (staff) => t('services.ptTitle', { staff }));

  const header = (
    <AppBar
      // The screen's one title header; the sections below are `SectionHeader`s.
      title={title}
      leading={
        <IconButton
          icon="chevronLeft"
          accessibilityLabel={t('services.detail.back')}
          onPress={back}
          testID="service-back"
        />
      }
    />
  );

  return (
    <Screen testID="service-detail-screen" header={header}>
      <View style={{ gap: spacing[5] }}>
        {offline ? (
          // A paused query never resolves, so a skeleton here promises content
          // that is not coming. `OfflineNotice` is what the other eleven
          // screens draw in this branch.
          // TODO(i18n): `common.offline.title` / `common.offline.body`.
          <OfflineNotice testID="service-offline" />
        ) : null}

        {loading ? (
          <View testID="service-loading" style={{ gap: spacing[3] }}>
            <DetailSkeleton />
          </View>
        ) : null}

        {!offline && !loading && failed ? (
          <EmptyState
            testID="service-error"
            icon="info"
            title={t('services.error')}
            action={{
              label: t('services.retry'),
              onPress: retry,
              variant: 'secondary',
              icon: 'refresh',
              testID: 'service-retry',
            }}
          />
        ) : null}

        {missing ? (
          // NOT an error, and deliberately NO retry: the catalogue loaded fine
          // and this id is not in it. The only useful action is going back.
          <EmptyState
            testID="service-not-found"
            icon="dumbbell"
            title={t('services.empty.title')}
            body={t('services.empty.subtitle')}
            action={{
              label: t('services.detail.back'),
              onPress: back,
              testID: 'service-not-found-back',
            }}
          />
        ) : null}

        {service !== undefined ? (
          <>
            {/* ── The service ──────────────────────────────────────────── */}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}
              testID="service-hero"
            >
              <Avatar
                size={HERO_AVATAR}
                initials={trainerInitials(service.staff.name)}
                {...(service.staff.photoUrl ? { source: { uri: service.staff.photoUrl } } : {})}
              />
              <View style={{ flex: 1, gap: spacing[1.5] }}>
                <Pill
                  tone={service.type === 'PERSONAL_TRAINING' ? 'accent' : 'outline'}
                  size="sm"
                  testID="service-type"
                >
                  {t(`services.type.${service.type}`)}
                </Pill>
                <Text variant="caption" color="textSecondary">
                  {[
                    t('services.card.with', { staff: service.staff.name }),
                    t('services.card.minutes', { count: service.durationMinutes }),
                  ].join(' · ')}
                </Text>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
                  accessible
                  accessibilityLabel={`${formatMoney(
                    service.priceMinor,
                    service.currency,
                    locale,
                  )} ${t('services.card.perSession')}`}
                >
                  <Money
                    accessibilityLabel={formatMoney(service.priceMinor, service.currency, locale)}
                    variant="monoBody"
                  >
                    {formatMoney(service.priceMinor, service.currency, locale)}
                  </Money>
                  <Text variant="caption" color="textSecondary">
                    {t('services.card.perSession')}
                  </Text>
                </View>
              </View>
            </View>

            {service.description !== '' ? (
              <Text variant="bodyRegular" color="textSecondary" testID="service-description">
                {service.description}
              </Text>
            ) : null}

            {/* ── Your sessions — signed in only, and only when non-empty ─ */}
            {signedIn ? (
              <MySessions
                sessions={mySessions}
                locale={locale}
                phase={sessionsPhase}
                onRetry={retryMine}
              />
            ) : null}

            {/* ── Pick a free slot ─────────────────────────────────────── */}
            <View style={{ gap: spacing[3] }} testID="service-slots">
              <SectionHeader
                title={t('services.detail.pickSlot')}
                subtitle={t('services.detail.pickSlotHint')}
              />
              <SlotCalendar gymId={gym.gymId} serviceId={service.id} onPickSlot={sheet.open} />
            </View>
          </>
        ) : null}
      </View>

      <BookingSheet
        slot={sheet.slot}
        locale={locale}
        signedIn={signedIn}
        busy={book.isPending}
        error={sheet.error}
        onClose={sheet.close}
        onConfirm={confirmBooking}
        onSignIn={signInForBooking}
        t={t}
      />
    </Screen>
  );
}

/** The detail's loading placeholder — hero, description, calendar. */
function DetailSkeleton() {
  return (
    <>
      <Skeleton height={HERO_AVATAR} radius={26} />
      <Skeleton height={64} radius={22} />
      <Skeleton height={160} radius={22} />
    </>
  );
}
