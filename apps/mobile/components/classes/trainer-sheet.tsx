// @fit/mobile — a trainer's WHOLE profile, in a bottom sheet.
//
// ===========================================================================
// THE SHEET *IS* THE PROFILE. THERE IS NO `/trainers/:id` ANY MORE.
//
// This used to be the short version — portrait, headline, specialties, bio —
// with "View full profile" pushing `/trainers/:id` for the rest. That screen is
// gone (deleted 2026-09-09), and everything it drew is drawn here: the hero
// with its rating, the bio, the specialty and location cards, the upcoming
// schedule and the reviews. Three surfaces now open the same sheet — the class
// detail's trainer row, the roster at `/trainers`, and home's "your coach" row
// — so a member meets one description of a coach rather than two that drift.
//
// WHY A SHEET AND NOT THE SCREEN THAT WAS HERE. A coach is something a member
// looks AT on the way to something else: the class they were reading, the
// roster they were scanning. A pushed route takes the screen away and makes
// coming back an act; a sheet keeps the thing they came from behind the scrim.
// `Sheet` already caps its body at 85% of the window and scrolls it (see
// `sheetBodyMaxHeight`), so "the whole profile" fits without a route.
//
// The portrait block is `components/trainers/trainer-hero.tsx`, the schedule
// `trainer-schedule.tsx` and the reviews `trainer-reviews.tsx` — the same three
// components the deleted screen composed, in the same order.
//
// ---------------------------------------------------------------------------
// COPY: `member.trainers.detail`, FALLING BACK TO `trainers.detail` FOR THE TWO
// THINGS THE MEMBER SET DOES NOT CARRY (D10).
//
//   member.trainers.detail = back · specialties · locations · schedule{title,
//                            empty} · notFound{title,subtitle,action}
//   trainers.detail        = the same, PLUS schedule.book and the whole
//                            reviews{title,empty,count,ratingLabel} block.
//
// So `specialties`, `locations`, `schedule.title`, `schedule.empty` and
// `notFound.*` come from the member set; `schedule.book` and `reviews.*` from
// the top-level one. Every borrowed key is marked at its call site.
//
// ---------------------------------------------------------------------------
// TWO REQUESTS, THREE PHASES EACH, AND NEITHER MAY BLANK THE OTHER.
//
// `GET /trainers/:id` and `GET /trainers/:id/reviews` are two queries, fired
// only once the sheet has been opened for someone. The profile owns the sheet's
// body; the reviews section owns its own loading / error / empty, so a 500 on
// the reviews costs the member the reviews rather than the coach. (Web awaits
// both server-side and swallows a reviews failure into `{reviews: [], total:
// 0}` — "no reviews yet", a lie with a plausible face.)
//
// A 404 is NOT an error: `GET /trainers/:id` answers it for an unknown id AND
// for one belonging to another tenant, deliberately indistinguishable, so a
// leaked id discloses nothing. That branch gets `notFound` and a way out.
//
// The caller's own denormalised `name` / `avatarUrl` are drawn IMMEDIATELY,
// under the request — the member pressed a row with a face and a name on it,
// and a sheet that opens on a skeleton where that face was reads as a different
// sheet.
//
// ---------------------------------------------------------------------------
// ONE SHEET PER SCREEN — SEE `Sheet`'s OWN HEADER.
//
// Two `Modal`s whose `visible` overlaps for one frame flash black on iOS. The
// screen holds the exclusion; this component's job is only to keep RENDERING
// while `open` is false, so the exit animation has a panel to run against.
// Hence `shown`: the last trainer survives the close.
// ===========================================================================

import { useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EmptyState,
  Icon,
  Pill,
  SectionHeader,
  Sheet,
  Skeleton,
  Surface,
  Text,
  spacing,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../auth/notices';
import { useIsOnline } from '../auth/use-online';
import { sectionPhase, type SectionPhase } from '../home/section';
import { TrainerHero } from '../trainers/trainer-hero';
import { TrainerReviewsSection, formatRating } from '../trainers/trainer-reviews';
import { TrainerScheduleSection } from '../trainers/trainer-schedule';
import { trainerQueryOptions, trainerReviewsQueryOptions } from '../../hooks/queries/useTrainers';
import { ApiError } from '../../lib/http/api-error';
import { queryKeys } from '../../lib/query-keys';
import { useI18n } from '../../providers/I18nProvider';

/**
 * How much of `queryKeys.trainerReviews` is the resource root:
 * `['trainers', gymId, 'detail', trainerId, 'reviews']`, i.e. everything before
 * the filter bucket the factory appends. Invalidating one PAGE's bucket would
 * leave every other page stale, and this sheet's own bucket is `{page: null,
 * limit: null}`, which is not a prefix of any other.
 */
const REVIEWS_ROOT_LENGTH = 5;

export interface TrainerSheetProps {
  /** The tenant the trainer is read under. */
  gymId: string | null;

  /** The trainer to show, or `null` when the sheet is closed. */
  trainerId: string | null;

  /** The caller's own denormalised name — the title, and the monogram. */
  name: string;

  /** The caller's own denormalised portrait, drawn under the request. */
  avatarUrl: string | null;

  /** Dismiss. */
  onClose: () => void;

  // No `onOpenProfile`, and there is nowhere for one to go: `/trainers/:id` is
  // deleted and this sheet is the whole profile (see the header). It survived a
  // while as a deprecated no-op so the old call sites kept compiling; none pass
  // it any more, so a prop that accepted a handler and never called it is gone
  // rather than left as a promise the sheet does not keep.

  testID?: string;
}

/** A trainer's whole profile — hero, bio, facts, schedule and reviews. */
export function TrainerSheet({
  gymId,
  trainerId,
  name,
  avatarUrl,
  onClose,
  testID = 'class-trainer-sheet',
}: TrainerSheetProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useIsOnline();

  // The last trainer the sheet was opened for. See the header: unmounting on
  // the frame `trainerId` clears would cut the exit animation, and on iOS the
  // panel would vanish rather than slide.
  const shown = useRef<string | null>(null);
  if (trainerId !== null) shown.current = trainerId;
  const id = shown.current;

  // Enabled by `trainerId` inside the options factories, so a sheet that has
  // never been opened makes no request — neither of them.
  const profile = useQuery(trainerQueryOptions(gymId, id));
  const reviews = useQuery(trainerReviewsQueryOptions(gymId, id));
  const trainer = profile.data?.trainer;

  if (id === null) return null;

  // A 404 is a dead end with a way out, not a failure with a retry — see the
  // header. It is checked BEFORE the phase so the error branch never claims it.
  const notFound = profile.isError && ApiError.is(profile.error) && profile.error.status === 404;

  // The sheet's OWN phase, not the screen's. With no tenant there is nothing to
  // ask and nothing to wait for, so that is the error branch rather than a
  // skeleton with no request behind it.
  const phase: SectionPhase = gymId === null ? 'error' : sectionPhase(profile, online);

  const retry = () => {
    // The trainer key, which `queryKeys.trainerReviews` is NESTED UNDER — one
    // invalidation therefore takes the reviews with it, which is exactly the
    // property `useTrainers.ts`'s header exists to preserve.
    void queryClient.invalidateQueries({ queryKey: queryKeys.trainer(gymId ?? '', id) });
  };

  const retryReviews = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.trainerReviews(gymId ?? '', id).slice(0, REVIEWS_ROOT_LENGTH),
    });
  };

  const reviewTotal = reviews.data?.total ?? 0;
  const reviewAverage = reviews.data?.avgRating ?? 0;

  const openService = (serviceId: string) => {
    // Closed BEFORE the push: a sheet left open behind a navigation is still
    // there when the member comes back, over a screen they have left.
    onClose();
    router.push(`/services/${serviceId}`);
  };

  return (
    <Sheet
      testID={testID}
      open={trainerId !== null}
      onClose={onClose}
      // The caller's own string, not the profile's — it is on screen already
      // and the title must not change shape when the request lands.
      title={name}
      closeAccessibilityLabel={t('classes.modal.close')}
    >
      <View style={{ gap: spacing[5] }}>
        {notFound ? (
          <EmptyState
            testID={`${testID}-not-found`}
            icon="users"
            title={t('member.trainers.detail.notFound.title')}
            body={t('member.trainers.detail.notFound.subtitle')}
            action={{
              // "Back to trainers" — and closing the sheet is exactly that:
              // whatever the member was reading is still behind the scrim.
              label: t('member.trainers.detail.notFound.action'),
              onPress: onClose,
              testID: `${testID}-not-found-back`,
            }}
          />
        ) : (
          <>
            <TrainerHero
              name={trainer?.name ?? name}
              headline={trainer?.headline ?? ''}
              avatarUrl={trainer?.avatarUrl ?? avatarUrl}
              rating={
                reviewTotal > 0
                  ? {
                      text: formatRating(reviewAverage),
                      // `trainers.detail.reviews.ratingLabel` (D10).
                      accessibilityLabel: t('trainers.detail.reviews.ratingLabel', {
                        rating: formatRating(reviewAverage),
                      }),
                    }
                  : null
              }
            />

            {phase === 'offline' ? (
              // A paused query never resolves; a skeleton here never stops.
              // TODO(i18n): `common.offline.title` / `common.offline.body`.
              <OfflineNotice testID={`${testID}-offline`} />
            ) : null}

            {phase === 'loading' ? (
              <View
                testID={`${testID}-loading`}
                accessible
                accessibilityLabel={t('member.trainers.loading')}
                style={{ gap: spacing[3] }}
              >
                <Skeleton height={72} radius={22} />
                <Skeleton height={120} radius={22} />
              </View>
            ) : null}

            {phase === 'error' ? (
              <EmptyState
                testID={`${testID}-error`}
                icon="info"
                title={t('member.trainers.error')}
                action={{
                  label: t('member.trainers.retry'),
                  onPress: retry,
                  variant: 'secondary',
                  icon: 'refresh',
                  testID: `${testID}-retry`,
                }}
              />
            ) : null}

            {trainer !== undefined ? (
              <>
                {trainer.bio !== '' ? (
                  <Text variant="bodyRegular" color="textSecondary" testID={`${testID}-bio`}>
                    {trainer.bio}
                  </Text>
                ) : null}

                {/* THE FACTS GO ON A CARD, as they did on the screen this
                    replaced and as every other detail surface does. Bare
                    headings over bare lines read as copy that has come loose
                    from a layout, next to the plated sections below. */}
                {trainer.specialties.length > 0 ? (
                  <Surface
                    tone="card"
                    padding={4}
                    style={{ gap: spacing[3] }}
                    testID={`${testID}-specialties`}
                  >
                    <SectionHeader title={t('member.trainers.detail.specialties')} />
                    <View
                      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}
                      accessibilityLabel={t('member.trainers.detail.specialties')}
                    >
                      {trainer.specialties.map((specialty) => (
                        // `Pill`, not `Chip`: nothing here filters anything.
                        <Pill key={specialty} tone="outline">
                          {specialty}
                        </Pill>
                      ))}
                    </View>
                  </Surface>
                ) : null}

                {trainer.locationNames.length > 0 ? (
                  <Surface
                    tone="card"
                    padding={4}
                    style={{ gap: spacing[3] }}
                    testID={`${testID}-locations`}
                  >
                    <SectionHeader title={t('member.trainers.detail.locations')} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                      <Icon name="pin" size={16} color="iconSecondary" />
                      <Text variant="body" color="textSecondary">
                        {/* ` · ` is web's separator for the same list.
                            Punctuation, not copy: no catalogue carries it. */}
                        {trainer.locationNames.join(' · ')}
                      </Text>
                    </View>
                  </Surface>
                ) : null}

                <TrainerScheduleSection
                  locale={locale}
                  schedule={trainer.schedule}
                  copy={{
                    title: t('member.trainers.detail.schedule.title'),
                    empty: t('member.trainers.detail.schedule.empty'),
                    // `trainers.detail.schedule.book` — the member set has no
                    // `book` under `schedule` (D10's fallback).
                    book: t('trainers.detail.schedule.book'),
                  }}
                  onOpenService={openService}
                />

                <TrainerReviewsSection
                  locale={locale}
                  data={reviews.data}
                  isPending={reviews.isPending && gymId !== null}
                  isError={reviews.isError}
                  isOffline={reviews.isPending && (!online || reviews.fetchStatus === 'paused')}
                  onRetry={retryReviews}
                  copy={{
                    // `trainers.detail.reviews.*` — the block `member.trainers`
                    // lacks (D10).
                    title: t('trainers.detail.reviews.title'),
                    empty: t('trainers.detail.reviews.empty'),
                    count: t('trainers.detail.reviews.count', { count: reviewTotal }),
                    ratingLabel: (rating: number) =>
                      t('trainers.detail.reviews.ratingLabel', {
                        rating: formatRating(rating),
                      }),
                    // No `reviews.error` / `reviews.retry` exists in either
                    // family; the roster's own pair is real, translated copy
                    // about loading trainer data and reads correctly here.
                    error: t('member.trainers.error'),
                    retry: t('member.trainers.retry'),
                  }}
                />
              </>
            ) : null}
          </>
        )}
      </View>
    </Sheet>
  );
}

/**
 * The name this component shipped under while it was the SHORT version opened
 * from class detail. Kept as an alias so the call sites that still import it
 * compile; new code should use {@link TrainerSheet}.
 *
 * @deprecated Use `TrainerSheet`.
 */
export const ClassTrainerSheet = TrainerSheet;

/** @deprecated Use {@link TrainerSheetProps}. */
export type ClassTrainerSheetProps = TrainerSheetProps;
