// The member's own bookings — the list, the counters, the cancel, the review.
//
// ===========================================================================
// WHY THIS IS A COMPONENT AND NOT A SCREEN.
//
// It has TWO hosts, and they draw different chrome around the same content:
//
//   · `app/(tabs)/classes/index.tsx` — the "My bookings" tab of the schedule,
//     under that screen's own `AppBar` and next to the week strip.
//   · `app/(tabs)/profile/bookings.tsx` — the deep-linkable `/profile/bookings`
//     route, under a back-button `AppBar`. Kept because Profile links to it and
//     because a URL that used to resolve should keep resolving.
//
// So everything above the content — the `Screen`, the `AppBar`, the back button
// — belongs to the host, and this file owns the content and nothing else. It
// renders a fragment (rows plus the two sheets) so either host can drop it
// straight into its `Screen`.
//
// The `bookings-` testID prefix is FIXED rather than a prop: both hosts want the
// same handles, and a Maestro flow that reaches this list through the tab should
// not need a second set of selectors from the one that reaches it through
// Profile.
//
// ---------------------------------------------------------------------------
// COPY IS `account.bookings` (47 keys) — a COMPLETE §6 set, which is rare.
//
// It carries `loading`, `error`, `retry`, both empties with their hints, the
// five status labels, the four counters, the cancel confirmation in full, and a
// whole `sessions` sub-block for personal training. This content is the one
// place in the stage where no branch had to be marked `TODO(i18n)`.
//
// ---------------------------------------------------------------------------
// A MEMBER CAN CANCEL A CLASS BOOKING AND **CANNOT** CANCEL A PT SESSION.
//
// That asymmetry is the API's, not a layout accident:
//
//   * `DELETE /class-instances/:id/bookings` is `ClassBook` — a member holds it.
//     `409 CANCELLATION_WINDOW_PASSED` means the seat is NOT released and the
//     credit is NOT refunded, which is why the failure is rendered rather than
//     swallowed.
//   * `admin/service-sessions/:id/cancel` is `ClassWrite` — a member does not
//     hold it (plan §7). So the sessions list below has no cancel affordance at
//     all, and `account.bookings.cancel` is never rendered against a session.
//     Adding a button there would produce a guaranteed 403.
//
// ---------------------------------------------------------------------------
// AND A MEMBER CAN REVIEW A CLASS THEY **ATTENDED**, FROM HERE.
//
// `POST /reviews` is accepted only with an `ATTENDED` booking for the
// occurrence (`403 NOT_ATTENDED`), and this list is the one place in the app
// where that status is rendered — so it is the one place where the composer can
// be offered *only* where it will be accepted, rather than offered everywhere
// and refused after the member has written something. The affordance therefore
// keys on `entry.status === 'ATTENDED'` and on nothing else.
//
// The second refusal, `409 ALREADY_REVIEWED`, cannot be predicted: no
// member-reachable route lists the caller's own reviews. See
// `components/reviews/review-form.ts` for why, and for why the 409 is rendered
// as a row STATE ("you have already reviewed this") rather than as an error.
//
// ---------------------------------------------------------------------------
// ONE SHEET, TWO KINDS. `Sheet` is single-instance per screen — two `Modal`s
// whose `visible` overlaps for a frame flash black on iOS — so the cancel
// confirmation and the review composer are driven by ONE discriminated
// `sheet` state, exactly as `sheet.tsx` prescribes, rather than by a boolean
// apiece. They can never be open at once: cancelling is offered on `BOOKED` /
// `WAITLIST` rows in the future and reviewing on `ATTENDED` rows in the past.
//
// The host must not draw a sheet of its own while this one is mounted, which is
// why the classes screen closes its filter sheet before switching tabs.
// ===========================================================================

import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { MemberBookingHistoryEntry } from '@fit/types';
import {
  Button,
  ConfirmSheet,
  EmptyState,
  InlineNote,
  ListRow,
  Pill,
  SectionHeader,
  Segmented,
  Skeleton,
  StatTile,
  Surface,
  TileGrid,
  layout,
  spacing,
  useToast,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../auth/notices';
import { useIsOnline } from '../auth/use-online';
import { bookingErrorKey } from './booking-errors';
import { sectionPhase } from '../home/section';
import { ReviewSheet } from '../reviews/review-sheet';
import { formatDayHeading, formatTime } from '../services/date-format';
import { useMyBookings } from '../../hooks/queries/useBookings';
import { useMyServiceSessions } from '../../hooks/queries/useServices';
import { useCancelBooking } from '../../hooks/mutations/useBookingMutations';
import { useGymId } from '../../hooks/useActiveGym';
import { queryKeys } from '../../lib/query-keys';
import { useI18n } from '../../providers/I18nProvider';

/** Which half of the history is on screen. */
type Half = 'upcoming' | 'past';

/**
 * The view's ONE sheet, as a discriminated union.
 *
 * `Sheet`'s own header states the rule and the shape: hold a single
 * `sheet: <name> | null` rather than a boolean per sheet, because two `Modal`s
 * whose `visible` overlaps for one frame flash black on iOS. The target rides
 * along, so the sheet's content is never derived from a second piece of state
 * that could disagree with which sheet is open.
 */
type SheetState =
  | { readonly kind: 'cancel'; readonly entry: MemberBookingHistoryEntry }
  | { readonly kind: 'review'; readonly entry: MemberBookingHistoryEntry }
  | null;

/** Has this occurrence already started? */
function isPast(entry: MemberBookingHistoryEntry, now: number): boolean {
  const ms = new Date(entry.classInstance.startsAt).getTime();
  return !Number.isFinite(ms) || ms < now;
}

export interface MyBookingsViewProps {
  /**
   * What "browse classes" does from the never-booked-anything empty state.
   *
   * Defaults to `router.push('/classes')`, which is right from
   * `/profile/bookings`. The classes screen passes its own — from the bookings
   * TAB, navigating to `/classes` would push the route the member is already
   * standing on, so it switches tabs instead.
   */
  onBrowseClasses?: () => void;
}

export function MyBookingsView({ onBrowseClasses }: MyBookingsViewProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useIsOnline();
  const gymId = useGymId();
  const scoped = gymId ?? '';

  const [now] = useState(() => Date.now());
  const [half, setHalf] = useState<Half>('upcoming');
  // ONE sheet, per `Sheet`'s single-instance rule. The kind AND the target are
  // the state, so two sheets cannot be open at once by construction.
  const [sheet, setSheet] = useState<SheetState>(null);
  /**
   * Occurrences the SERVER has confirmed are reviewed — from a `201` or from a
   * `409 ALREADY_REVIEWED`, which mean the same thing to a row.
   *
   * View state on purpose, and not a store: see
   * `components/reviews/review-form.ts`. It is never persisted, so it can never
   * tell a second member on a shared device that they already reviewed
   * something the first one did.
   */
  const [reviewed, setReviewed] = useState<readonly string[]>([]);

  const confirming = sheet?.kind === 'cancel' ? sheet.entry : null;
  const composing = sheet?.kind === 'review' ? sheet.entry : null;

  // `all`, not the server's `scope`: the counters below need every status, and
  // splitting the two views client-side is one request rather than two.
  const bookings = useMyBookings('all');
  const sessions = useMyServiceSessions();
  const cancel = useCancelBooking();

  const rows = useMemo(() => bookings.data?.bookings ?? [], [bookings.data]);

  const counts = useMemo(
    () => ({
      upcoming: rows.filter(
        (row) => !isPast(row, now) && (row.status === 'BOOKED' || row.status === 'WAITLIST'),
      ).length,
      attended: rows.filter((row) => row.status === 'ATTENDED').length,
      waitlist: rows.filter((row) => row.status === 'WAITLIST').length,
      total: rows.length,
    }),
    [rows, now],
  );

  const visible = useMemo(
    () =>
      rows
        .filter((row) => (half === 'upcoming' ? !isPast(row, now) : isPast(row, now)))
        .filter((row) =>
          half === 'upcoming' ? row.status === 'BOOKED' || row.status === 'WAITLIST' : true,
        )
        .sort((a, b) => {
          const at = new Date(a.classInstance.startsAt).getTime();
          const bt = new Date(b.classInstance.startsAt).getTime();
          // Soonest first while looking forward, most recent first looking back.
          return half === 'upcoming' ? at - bt : bt - at;
        }),
    [rows, half, now],
  );

  const phase = sectionPhase(bookings, online);
  const sessionsPhase = sectionPhase(sessions, online);

  const retry = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings(scoped) });
  }, [queryClient, scoped]);

  const browse = useCallback(() => {
    if (onBrowseClasses) onBrowseClasses();
    else router.push('/classes');
  }, [onBrowseClasses, router]);

  const confirmCancel = useCallback(() => {
    if (confirming === null || cancel.isPending) return;
    const target = confirming;
    cancel.mutate(
      { classId: target.classInstance.id },
      {
        onSuccess: () => {
          setSheet(null);
          toast.success(t('member.actions.canceled'));
        },
        onError: (error: unknown) => {
          setSheet(null);
          // `409 CANCELLATION_WINDOW_PASSED` has its own sentence — the seat is
          // NOT released and the credit is NOT refunded, and a generic "try
          // again" would invite a member to press a button that cannot work.
          toast.error(t(bookingErrorKey(error)));
        },
      },
    );
  }, [confirming, cancel, toast, t]);

  const upcomingSessions = useMemo(
    () =>
      (sessions.data?.sessions ?? [])
        .filter((session) => session.status === 'BOOKED')
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [sessions.data],
  );

  return (
    <>
      <View style={{ gap: layout.sectionGap }}>
        {online ? null : <OfflineNotice testID="bookings-offline" />}

        {/* ── Counters ───────────────────────────────────────────────────── */}
        {phase === 'ready' ? (
          <TileGrid testID="bookings-stats" columns={2} gap={3}>
            <StatTile
              testID="bookings-stat-upcoming"
              label={t('account.bookings.stats.upcoming')}
              value={String(counts.upcoming)}
              accessibilityLabel={`${t('account.bookings.stats.upcoming')}: ${String(counts.upcoming)}`}
            />
            <StatTile
              testID="bookings-stat-attended"
              label={t('account.bookings.stats.attended')}
              value={String(counts.attended)}
              accessibilityLabel={`${t('account.bookings.stats.attended')}: ${String(counts.attended)}`}
            />
            <StatTile
              testID="bookings-stat-waitlist"
              label={t('account.bookings.stats.waitlist')}
              value={String(counts.waitlist)}
              accessibilityLabel={`${t('account.bookings.stats.waitlist')}: ${String(counts.waitlist)}`}
            />
            <StatTile
              testID="bookings-stat-total"
              label={t('account.bookings.stats.total')}
              value={String(counts.total)}
              accessibilityLabel={`${t('account.bookings.stats.total')}: ${String(counts.total)}`}
            />
          </TileGrid>
        ) : null}

        {/* ── Upcoming / past ────────────────────────────────────────────── */}
        <View style={{ gap: spacing[3.5] }}>
          <Segmented
            testID="bookings-view"
            label={t('account.bookings.viewLabel')}
            value={half}
            onChange={setHalf}
            options={[
              { value: 'upcoming', label: t('account.bookings.upcoming') },
              { value: 'past', label: t('account.bookings.past') },
            ]}
          />

          {phase === 'loading' ? (
            <View
              testID="bookings-loading"
              accessible
              accessibilityLabel={t('account.bookings.loading')}
              style={{ gap: spacing[3] }}
            >
              <Skeleton height={72} radius={22} />
              <Skeleton height={72} radius={22} />
              <Skeleton height={72} radius={22} />
            </View>
          ) : null}

          {phase === 'error' ? (
            <EmptyState
              testID="bookings-error"
              icon="info"
              title={t('account.bookings.error')}
              action={{
                label: t('account.bookings.retry'),
                onPress: retry,
                variant: 'secondary',
                testID: 'bookings-retry',
              }}
            />
          ) : null}

          {phase === 'ready' ? (
            visible.length === 0 ? (
              rows.length === 0 ? (
                // Never booked anything at all — a different question from
                // "nothing in this half of the history", and the only one whose
                // next action is "go and browse".
                <EmptyState
                  testID="bookings-empty"
                  icon="calendar"
                  title={t('account.bookings.empty.title')}
                  body={t('account.bookings.empty.subtitle')}
                  action={{
                    label: t('account.bookings.empty.action'),
                    onPress: browse,
                    variant: 'primary',
                    testID: 'bookings-browse',
                  }}
                />
              ) : (
                <EmptyState
                  testID={`bookings-empty-${half}`}
                  icon="clock"
                  title={
                    half === 'upcoming'
                      ? t('account.bookings.noUpcoming')
                      : t('account.bookings.noPast')
                  }
                  body={
                    half === 'upcoming'
                      ? t('account.bookings.noUpcomingHint')
                      : t('account.bookings.noPastHint')
                  }
                />
              )
            ) : (
              <View style={{ gap: spacing[3] }} testID="bookings-list">
                {visible.map((entry) => {
                  const instance = entry.classInstance;
                  const when = `${formatDayHeading(locale, instance.startsAt)} · ${formatTime(
                    locale,
                    instance.startsAt,
                  )}`;
                  const status =
                    entry.status === 'WAITLIST' && entry.waitlistPosition !== null
                      ? t('account.bookings.waitlistPosition', {
                          position: entry.waitlistPosition,
                        })
                      : t(`account.bookings.status.${entry.status}`);
                  const cancellable =
                    half === 'upcoming' &&
                    (entry.status === 'BOOKED' || entry.status === 'WAITLIST');

                  return (
                    <Surface key={entry.bookingId} tone="card" padding={4} radius={22}>
                      <View style={{ gap: spacing[3] }}>
                        <ListRow
                          testID={`bookings-row-${entry.bookingId}`}
                          icon="calendar"
                          title={instance.title}
                          hint={`${when} · ${instance.trainerName}`}
                          onPress={() => {
                            router.push(`/classes/${instance.id}`);
                          }}
                          accessibilityLabel={`${instance.title}, ${when}, ${status}`}
                          accessibilityHint={t('account.bookings.viewClass')}
                          trailing={
                            <View
                              accessible={false}
                              accessibilityElementsHidden
                              importantForAccessibility="no-hide-descendants"
                            >
                              <Pill tone={entry.status === 'BOOKED' ? 'booked' : 'quiet'} size="sm">
                                {status}
                              </Pill>
                            </View>
                          }
                        />
                        {cancellable ? (
                          <Button
                            testID={`bookings-cancel-${entry.bookingId}`}
                            label={t('account.bookings.cancel')}
                            variant="secondary"
                            size="sm"
                            busy={cancel.isPending && confirming?.bookingId === entry.bookingId}
                            onPress={() => {
                              setSheet({ kind: 'cancel', entry });
                            }}
                          />
                        ) : null}

                        {/* The review affordance, offered ONLY where the API
                            will accept one. `ATTENDED` is the whole condition
                            — see the header — so a member never meets `403
                            NOT_ATTENDED` from a control this view drew. */}
                        {entry.status === 'ATTENDED' ? (
                          reviewed.includes(instance.id) ? (
                            <InlineNote
                              testID={`bookings-reviewed-${entry.bookingId}`}
                              icon="check"
                            >
                              {t('member.reviews.already')}
                            </InlineNote>
                          ) : (
                            <Button
                              testID={`bookings-review-${entry.bookingId}`}
                              label={t('member.reviews.rate')}
                              variant="secondary"
                              size="sm"
                              icon="star"
                              onPress={() => {
                                setSheet({ kind: 'review', entry });
                              }}
                            />
                          )
                        ) : null}
                      </View>
                    </Surface>
                  );
                })}
              </View>
            )
          ) : null}
        </View>

        {/* ── Personal-training sessions ─────────────────────────────────── */}
        <View style={{ gap: spacing[3.5] }} testID="bookings-sessions">
          <SectionHeader
            title={t('account.bookings.sessions.title')}
            subtitle={t('account.bookings.sessions.subtitle')}
            size="md"
            action={{
              label: t('account.bookings.sessions.action'),
              onPress: () => {
                router.push('/services');
              },
              testID: 'bookings-sessions-book',
            }}
          />

          {sessionsPhase === 'loading' ? (
            <View
              testID="bookings-sessions-loading"
              accessible
              accessibilityLabel={t('account.bookings.loading')}
            >
              <Skeleton height={72} radius={22} />
            </View>
          ) : null}

          {sessionsPhase === 'error' ? (
            <EmptyState
              testID="bookings-sessions-error"
              icon="info"
              title={t('account.bookings.error')}
              action={{
                label: t('account.bookings.retry'),
                onPress: () => {
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.myServiceSessions(scoped).slice(0, 2),
                  });
                },
                variant: 'secondary',
                testID: 'bookings-sessions-retry',
              }}
            />
          ) : null}

          {sessionsPhase === 'ready' ? (
            upcomingSessions.length === 0 ? (
              <EmptyState
                testID="bookings-sessions-empty"
                icon="dumbbell"
                title={t('account.bookings.sessions.noUpcoming')}
                body={t('account.bookings.sessions.empty')}
              />
            ) : (
              <Surface tone="card" padVertical={1}>
                {upcomingSessions.map((session) => {
                  const when = `${formatDayHeading(locale, session.startsAt)} · ${formatTime(
                    locale,
                    session.startsAt,
                  )}`;
                  return (
                    <ListRow
                      key={session.id}
                      testID={`bookings-session-${session.id}`}
                      icon="dumbbell"
                      title={session.serviceName}
                      hint={`${when} · ${session.staffName}`}
                      // NO onPress and NO cancel: a member can book a session
                      // and cannot release one — `admin/service-sessions/:id/
                      // cancel` is `ClassWrite`. See the header.
                      accessibilityLabel={`${session.serviceName}, ${when}, ${session.staffName}`}
                    />
                  );
                })}
              </Surface>
            )
          ) : null}
        </View>
      </View>

      <ConfirmSheet
        testID="bookings-confirm"
        open={confirming !== null}
        onClose={() => {
          if (!cancel.isPending) setSheet(null);
        }}
        onConfirm={confirmCancel}
        title={t('account.bookings.confirm.title')}
        closeAccessibilityLabel={t('account.bookings.confirm.keep')}
        confirmLabel={t('account.bookings.confirm.confirm')}
        cancelLabel={t('account.bookings.confirm.keep')}
        destructive
        busy={cancel.isPending}
        note={
          confirming === null
            ? undefined
            : t('account.bookings.confirm.description', {
                title: confirming.classInstance.title,
              })
        }
      />

      {/* The SECOND kind of the one sheet, never open at the same time as the
          first — `sheet` can only hold one. The composer owns the request; the
          view owns which row it is against and remembers the answer. */}
      <ReviewSheet
        testID="bookings-review"
        open={composing !== null}
        onClose={() => {
          setSheet(null);
        }}
        target={
          composing === null
            ? null
            : {
                classInstanceId: composing.classInstance.id,
                title: composing.classInstance.title,
                when: `${formatDayHeading(locale, composing.classInstance.startsAt)} · ${formatTime(
                  locale,
                  composing.classInstance.startsAt,
                )}`,
              }
        }
        onReviewed={(classInstanceId) => {
          setReviewed((current) =>
            current.includes(classInstanceId) ? current : [...current, classInstanceId],
          );
        }}
      />
    </>
  );
}
