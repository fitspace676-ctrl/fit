// Home — `mobile-home-v2.tsx`, on real data. Built LAST, on purpose.
//
// ===========================================================================
// SEVEN ENDPOINTS, SIX SECTIONS, SIX BRANCHES. NEVER ONE SPINNER.
//
// The deleted app's home screen hardcoded `ACTIVE`, `22 / 30` and a 73% ring
// into its membership card, and §1 of `docs/mobile-rebuild-plan.md` names it as
// one of the three reasons the app was deleted. WP-10..15 therefore schedules
// this screen last: "building it first is exactly how the hardcoded
// `ACTIVE / 22/30 / 73%` happened. Every section gets its own loading/empty/
// error — never one page-level spinner."
//
// Both halves of that are enforced rather than remembered:
//
//   * **Nothing here is a literal.** `home.test.tsx` greps THIS FILE and
//     `components/home/**` for `ACTIVE`, `22`, `30` and `73` and fails on any
//     of them. Every number on screen is a field on a response or a pure
//     function of one (`components/membership/derive.ts`,
//     `components/home/derive.ts`), and both modules are separately tested.
//
//   * **Every section owns its phase.** `HomeSection` + `sectionPhase()` give
//     each one its own skeleton, its own offline branch, and its own error box
//     with a retry that invalidates only that section's key. Web achieves the
//     same resilience with `safe()`, which swallows the failure into an empty
//     array — good enough for a server render, useless on a phone, because it
//     cannot tell "this gym has no trainers" from "the trainers call 500'd" and
//     leaves nothing to retry.
//
// ---------------------------------------------------------------------------
// WHAT IS ON SCREEN, AND WHERE EACH NUMBER COMES FROM.
//
//   banners         `GET /banners` — the gym's promotional reel, and the one
//                   block on this screen that is NOT a `HomeSection`. Marketing
//                   does not get a skeleton, an error box or a retry: nobody
//                   opened the app to look at it, so a slow request must not
//                   reserve a screen-wide hole above the member's plan and a
//                   failed one must not put "we couldn't load this · Try again"
//                   on screen for an advertisement. It renders only once the
//                   request has answered with at least one slide, and is absent
//                   otherwise — loading, failed, offline and "this gym runs no
//                   campaigns" all draw exactly nothing.
//   greeting        `GET /me/profile` — the member's name, with
//                   `member.home.greetingFallbackName` while it loads or fails.
//                   The bell's dot is `GET /notifications/unread-count`.
//   membership      `GET /me/subscription`. Plan, status, period, days left.
//                   Its cover band is `GET /gyms/by-subdomain/:slug` →
//                   `portal.loginImageUrl` — the gym's own photograph, and the
//                   one image the member contract carries. Not part of the
//                   section's phase; see the query's note below.
//   counters        `GET /me/bookings` + `GET /members/me/credit-packs`.
//   upcoming        `GET /me/bookings` again — same query, different question.
//   services        `GET /services` + `GET /me/service-sessions`. The section is
//                   ABSENT for a gym that sells none — see it below.
//   trainers        `GET /trainers`. Three of them, and a row opens the coach's
//                   sheet rather than the coach's screen.
//   for training    `GET /products`.
//
// There is no "book a class" rail. It drew six class cards above the fold —
// roughly a screen and a half of discovery on the one screen a member opens to
// check what they have already booked — and the member's own bookings were left
// at the foot of the page under all of it. Discovery is the classes tab's job;
// Home states the member's standing and links there. The section's derivations
// (`bookableClasses`, `bookableWindow`) went with it, and `member.home.bookClass`
// / `noBookable` stay in the catalogue because web's home still reads them.
//
// ---------------------------------------------------------------------------
// THREE ARTBOARD ELEMENTS ARE NOT HERE, AND EACH ABSENCE IS A FINDING.
//
//   1. **The day-streak tile.** Needs a check-in log. The only check-in surface
//      on the API is `@Controller('admin/check-ins')` behind `MemberRead` /
//      `MemberWrite` — a `MEMBER` token cannot call it. See
//      `components/home/stat-strip.tsx`.
//   2. **The check-in QR disc** on the membership capsule. That screen was
//      removed on 2026-08-31 (Q1: no scanner integration, nothing to talk to),
//      and `member.home.showQr` / `qrTitle` / `qrSub` / `checkIn` are now dead
//      copy. The capsule's action opens the membership screen instead.
//   3. **A "cancel membership" affordance** anywhere on the block.
//      `cancelAtPeriodEnd` is rendered as a status LINE; there is no member
//      route that writes it (plan §7).
//
// ---------------------------------------------------------------------------
// `now` IS PINNED IN STATE, AND THAT IS LOAD-BEARING.
//
// Every "upcoming" filter and every "days left" figure on the screen is
// measured against it. A fresh `new Date()` in the render body would give each
// of them a slightly different instant; `useState(() => new Date())` pins one
// for the life of the mount, so they all agree.
//
// ---------------------------------------------------------------------------
// THIS ROUTE IS `auth`. There is no signed-out branch, deliberately:
// `ROUTE_POLICY` has `'(tabs)/home': 'auth'`, so `resolveRedirect` sends a
// signed-out visitor to `/login?next=/home` before this component mounts. The
// public discovery surfaces (classes, shop, trainers, services) are where the
// signed-out branches live.

import { useCallback, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { PublicBanner } from '@fit/types';
import {
  AppBar,
  Avatar,
  Button,
  EmptyState,
  IconButton,
  Pill,
  Screen,
  ScrollRail,
  Skeleton,
  Surface,
  layout,
  spacing,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../../components/auth/notices';
import { useIsOnline } from '../../components/auth/use-online';
import { HomeBannerSlider, type BannerTarget } from '../../components/home/banner-slider';
import {
  SERVICES_LIMIT,
  SHOP_RAIL_LIMIT,
  UPCOMING_LIMIT,
  upcomingBookings,
} from '../../components/home/derive';
import { HomeSection, combinePhases, sectionPhase } from '../../components/home/section';
import { HomeStatStrip } from '../../components/home/stat-strip';
import {
  NextSessionRow,
  ServiceRow,
  ShopRailRow,
  TrainerRow,
  UpcomingBookingRow,
} from '../../components/home/rows';
import { TRAINERS_LIMIT, nextServiceSession } from '../../components/home/derive';
import { TrainerSheet } from '../../components/classes/trainer-sheet';
import { HomeMembershipCard } from '../../components/membership/membership-card';
import { creditBalance } from '../../components/membership/derive';
import { formatDayLong } from '../../components/services/date-format';
import { trainerInitials } from '../../components/trainers/trainer-filters';
import { useBanners } from '../../hooks/queries/useBanners';
import { useMyBookings } from '../../hooks/queries/useBookings';
import { useGymBySlug } from '../../hooks/queries/useGym';
import { useCreditPacks, useMembership } from '../../hooks/queries/useMembership';
import { useMyProfile } from '../../hooks/queries/useAccount';
import { useUnreadCount } from '../../hooks/queries/useNotifications';
import { useMyServiceSessions, useServices } from '../../hooks/queries/useServices';
import { useProducts } from '../../hooks/queries/useShop';
import { useTrainers } from '../../hooks/queries/useTrainers';
import { useGymId } from '../../hooks/useActiveGym';
import { resolveGymSlug } from '../../lib/auth/session';
import { queryKeys } from '../../lib/query-keys';
import { useI18n } from '../../providers/I18nProvider';

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const gymId = useGymId();

  // See the header: pinned, so every figure on the screen agrees with the rest.
  const [now] = useState(() => new Date());

  const profile = useMyProfile();
  const membership = useMembership();
  // `all`, not `upcoming`: the same rows answer both "what is next" and "how
  // many have I ever booked", and one query is one request.
  const bookings = useMyBookings('all');
  const packs = useCreditPacks();
  const services = useServices();
  const sessions = useMyServiceSessions();
  const trainers = useTrainers();
  const products = useProducts();
  const unread = useUnreadCount();
  const banners = useBanners();

  /**
   * The public tenant lookup, for one field: `portal.loginImageUrl`.
   *
   * The gym's own photograph — the picture it uploaded for the member portal's
   * sign-in screen — drawn as the band across the top of the membership block.
   * It is the ONLY gym-authored image on the member contract: `brand.logoUrl` is
   * a mark rather than a photograph and nothing else on the wire carries one.
   *
   * This query is NOT gym-scoped and is not part of any section's phase: it is
   * keyed by slug (`NON_GYM_SCOPED_KEYS`), it is the same 10-minute-stale record
   * login and settings already read, and a gym whose lookup is slow or 404s
   * simply renders the block without a cover. Wiring it into `membershipPhase`
   * would let a branding request skeleton the member's plan.
   */
  const gym = useGymBySlug(resolveGymSlug() ?? null);
  const coverUrl = gym.data?.portal.loginImageUrl ?? null;

  /**
   * Invalidate one resource root.
   *
   * Never `.refetch()`: the plan bans it outright, and a root invalidation is
   * also what takes every filter bucket under it — which is the difference
   * between the badge refreshing and the badge lying.
   */
  const invalidate = useCallback(
    (key: readonly unknown[]) => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
    [queryClient],
  );

  const scoped = gymId ?? '';

  const upcoming = useMemo(
    () => upcomingBookings(bookings.data?.bookings, now),
    [bookings.data, now],
  );
  const credits = useMemo(() => creditBalance(packs.data?.packs), [packs.data]);
  const nextSession = useMemo(
    () => nextServiceSession(sessions.data?.sessions, now),
    [sessions.data, now],
  );

  const memberName = profile.data?.profile.name?.trim();
  const unreadCount = unread.data?.unread ?? 0;

  /**
   * The carousel's slides — and its ONLY branch.
   *
   * `?? []` collapses loading, offline, error and "no campaigns" into one
   * answer, which is the whole of the marketing block's policy: the reel is
   * drawn when there is something to draw and is absent otherwise. That is why
   * this query is not fed into a `sectionPhase` like the six sections are.
   */
  const bannerSlides = banners.data?.banners ?? [];

  /**
   * Follow a slide.
   *
   * The destination was resolved by the slider (which knows which in-app roots
   * exist); this decides only *how* to open it. A rejected `openURL` — a URL the
   * OS has no handler for — is swallowed on purpose: there is no recovery to
   * offer and an error dialog over an advertisement is worse than nothing
   * happening.
   */
  const openBanner = useCallback(
    (_banner: PublicBanner, target: BannerTarget) => {
      if (target.kind === 'route') {
        router.push(target.path);
        return;
      }
      void Linking.openURL(target.url).catch(() => undefined);
    },
    [router],
  );

  // The trainers teaser, and the coach whose sheet is open. The sheet takes the
  // trainer's name and portrait as props (it draws them under its own request),
  // so the row's own record is looked up rather than re-fetched.
  const trainerRows = useMemo(
    () => (trainers.data?.trainers ?? []).slice(0, TRAINERS_LIMIT),
    [trainers.data],
  );
  const [trainerSheetId, setTrainerSheetId] = useState<string | null>(null);
  const sheetTrainer = trainerRows.find((trainer) => trainer.id === trainerSheetId) ?? null;

  const membershipPhase = sectionPhase(membership, online);
  const statsPhase = combinePhases(sectionPhase(bookings, online), sectionPhase(packs, online));
  const servicesPhase = combinePhases(
    sectionPhase(services, online),
    sectionPhase(sessions, online),
  );
  const trainersPhase = sectionPhase(trainers, online);
  const productsPhase = sectionPhase(products, online);
  const upcomingPhase = sectionPhase(bookings, online);

  return (
    <Screen
      testID="home-screen"
      header={
        <AppBar
          testID="home-appbar"
          // The date, in the device's wall clock — `Intl` is banned and
          // `createDateTimeFormat` reads UTC, so `wallClock()` does the shift.
          eyebrow={formatDayLong(locale, now)}
          // The screen's first `role="header"`. The sections add the rest.
          // The greeting is a phrase, not a noun: at the default 28 it truncates
          // to "კეთილი დაბრ…" between the avatar and the bell. The artboard
          // draws this one header at 20 for the same reason.
          titleVariant="section"
          title={t('member.home.greeting')}
          subtitle={
            profile.isPending && profile.data === undefined
              ? t('member.home.greetingFallbackName')
              : memberName === undefined || memberName === ''
                ? t('member.home.greetingFallbackName')
                : memberName
          }
          leading={
            <Avatar
              size={52}
              ring="accent"
              initials={initialsFor(memberName)}
              accessibilityLabel={memberName ?? t('member.home.greetingFallbackName')}
              testID="home-avatar"
            />
          }
          trailing={
            <IconButton
              icon="bell"
              accessibilityLabel={t('member.profile.mobile.notificationsA11y')}
              onPress={() => {
                router.push('/profile/notifications');
              }}
              {...(unreadCount > 0 ? { badge: { count: unreadCount } } : {})}
              testID="home-notifications"
            />
          }
        />
      }
    >
      <View style={{ gap: layout.sectionGap }}>
        {/* The radio is a screen-wide fact, so it is stated once at the top as
            well as per section: eight offline boxes would be absurd, but a
            member who scrolled past the first section still needs to know. */}
        {online ? null : <OfflineNotice testID="home-offline" />}

        {/* ── Promotions ─────────────────────────────────────────────────── */}
        {/* Under the greeting, above the member's plan, and NOT a
            `HomeSection` — see the header. No heading either: the artboard's
            reel is the picture, and a "Promotions" title over an advertisement
            is chrome announcing an advertisement. */}
        <HomeBannerSlider banners={bannerSlides} onPressBanner={openBanner} testID="home-banners" />

        {/* ── Membership ─────────────────────────────────────────────────── */}
        <HomeSection
          testID="home-membership"
          phase={membershipPhase}
          onRetry={() => {
            invalidate(queryKeys.membership(scoped));
          }}
          skeleton={<Skeleton height={196} radius="page" />}
        >
          {membership.data === undefined ? null : (
            <HomeMembershipCard
              data={membership.data}
              now={now}
              coverUrl={coverUrl}
              onManage={() => {
                router.push('/profile/membership');
              }}
            />
          )}
        </HomeSection>

        {/* ── Counters ───────────────────────────────────────────────────── */}
        <HomeSection
          testID="home-stat-strip"
          phase={statsPhase}
          onRetry={() => {
            invalidate(queryKeys.bookings(scoped));
            invalidate(queryKeys.creditPacks(scoped));
          }}
          skeleton={<Skeleton height={92} radius={26} />}
        >
          <HomeStatStrip upcomingCount={upcoming.length} credits={credits} />
        </HomeSection>

        {/* ── Upcoming bookings ──────────────────────────────────────────── */}
        {/* Directly under the counters, and the ONLY class-booking surface on
            Home: a member opens this screen to see what they have booked, and
            discovering new classes is the classes tab's job — which is where
            both the section action and the empty state's CTA go. */}
        <HomeSection
          testID="home-upcoming"
          title={t('member.home.upcomingBookings')}
          action={{
            label: t('member.home.myBookings'),
            onPress: () => {
              router.push('/profile/bookings');
            },
            testID: 'home-upcoming-all',
          }}
          phase={upcomingPhase}
          onRetry={() => {
            invalidate(queryKeys.bookings(scoped));
          }}
        >
          {upcoming.length === 0 ? (
            <EmptyState
              testID="home-upcoming-empty"
              icon="clock"
              title={t('member.home.noClasses')}
              action={{
                label: t('member.home.browseClasses'),
                onPress: () => {
                  router.push('/classes');
                },
                variant: 'secondary',
                testID: 'home-upcoming-browse',
              }}
            />
          ) : (
            <Surface tone="card" padVertical={1}>
              {upcoming.slice(0, UPCOMING_LIMIT).map((entry) => (
                <UpcomingBookingRow
                  key={entry.bookingId}
                  entry={entry}
                  onPress={() => {
                    router.push(`/classes/${entry.classInstance.id}`);
                  }}
                  testID={`home-booking-${entry.bookingId}`}
                />
              ))}
            </Surface>
          )}
        </HomeSection>

        {/* ── Services ───────────────────────────────────────────────────── */}
        {/* A GYM WITH NO SERVICES GETS NO SECTION — not a heading over "no
            services yet". The other sections' empty states each carry an action
            the member can take ("browse classes", "visit shop"); this one never
            could, because whether a gym sells personal training is the gym's
            decision and nothing a member does changes it. A heading, a link to
            an equally empty `/services`, and a sentence saying so is three rows
            of chrome reporting an absence. The loading, offline and error
            branches are UNTOUCHED: "we could not load the services" is a real
            thing to say, and a section that vanished on a failed request would
            be indistinguishable from a gym that sells none. */}
        {servicesPhase === 'ready' &&
        nextSession === null &&
        (services.data?.services ?? []).length === 0 ? null : (
          <HomeSection
            testID="home-services"
            title={t('member.home.services')}
            action={{
              label: t('member.home.viewServices'),
              onPress: () => {
                router.push('/services');
              },
              testID: 'home-services-all',
            }}
            phase={servicesPhase}
            onRetry={() => {
              invalidate(['services', scoped]);
              invalidate(queryKeys.myServiceSessions(scoped).slice(0, 2));
            }}
          >
            <View style={{ gap: spacing[2] }}>
              {nextSession === null ? null : (
                <NextSessionRow
                  session={nextSession}
                  onPress={() => {
                    router.push('/profile/bookings');
                  }}
                  testID="home-next-session"
                />
              )}

              {/* Empty AND a booked session is a state the API allows — a
                  session survives its service being retired — so the list is
                  still guarded rather than assumed non-empty. */}
              {(services.data?.services ?? []).length === 0 ? null : (
                <Surface tone="card" padVertical={1}>
                  {(services.data?.services ?? []).slice(0, SERVICES_LIMIT).map((service) => (
                    <ServiceRow
                      key={service.id}
                      service={service}
                      onPress={() => {
                        router.push(`/services/${service.id}`);
                      }}
                      testID={`home-service-${service.id}`}
                    />
                  ))}
                </Surface>
              )}
            </View>
          </HomeSection>
        )}

        {/* ── Trainers ───────────────────────────────────────────────────── */}
        {/* The gym's coaches, three of them, as a teaser for `/trainers` — the
            same shape as the shop section below (a few rows, then one button to
            the whole thing). It was "Your trainer" over the first name in a
            roster ordered alphabetically: the API models no member↔trainer
            relationship, so "your" was a claim the wire cannot support, and the
            plan's own §7 lists it. Tapping a row opens the coach's SHEET rather
            than navigating — see `components/home/rows.tsx`. */}
        <HomeSection
          testID="home-trainer"
          title={t('member.home.trainers')}
          phase={trainersPhase}
          onRetry={() => {
            invalidate(queryKeys.trainers(scoped));
          }}
          skeleton={<Skeleton height={84} radius={26} />}
        >
          {trainerRows.length === 0 ? (
            <EmptyState
              testID="home-trainer-empty"
              icon="users"
              title={t('member.trainers.empty.title')}
            />
          ) : (
            <View style={{ gap: spacing[3] }}>
              {trainerRows.map((trainer) => (
                <TrainerRow
                  key={trainer.id}
                  trainer={trainer}
                  // The noun is copy, the name is data. `PersonRow`'s pressable
                  // shape requires the whole sentence — the row is one stop.
                  accessibilityLabel={`${t('member.home.trainers')}, ${trainer.name}`}
                  onPress={() => {
                    setTrainerSheetId(trainer.id);
                  }}
                  testID={`home-trainer-${trainer.id}`}
                />
              ))}

              <Button
                label={t('member.home.viewAll')}
                variant="secondary"
                fullWidth
                onPress={() => {
                  router.push('/trainers');
                }}
                testID="home-trainer-all"
              />
            </View>
          )}
        </HomeSection>

        {/* ── For your training ──────────────────────────────────────────── */}
        <HomeSection
          testID="home-shop"
          title={t('member.home.forTraining')}
          phase={productsPhase}
          onRetry={() => {
            invalidate(['products', scoped]);
          }}
        >
          <View style={{ gap: spacing[3] }}>
            {/* The artboard's lime "−10%" chip. Copy, not a computed discount:
                `member.home.membersGet` is a fixed marketing string and no
                endpoint returns a member discount rate. */}
            <View style={{ flexDirection: 'row' }}>
              <Pill tone="accent" size="sm">
                {t('member.home.membersGet')}
              </Pill>
            </View>

            {(products.data?.products ?? []).length === 0 ? (
              <EmptyState testID="home-shop-empty" icon="bag" title={t('member.home.noProducts')} />
            ) : (
              // A rail, not a stack: the section is a teaser for the shop, and
              // side by side it costs one screen-height instead of four. The
              // section already sits inside the screen gutter, so the rail adds
              // no edge padding of its own — `edgePadding` defaults to the
              // gutter and would double it.
              <ScrollRail testID="home-shop-rail" edgePadding={0} gap={3}>
                {(products.data?.products ?? []).slice(0, SHOP_RAIL_LIMIT).map((product) => (
                  <ShopRailRow
                    key={product.id}
                    product={product}
                    onPress={() => {
                      router.push(`/shop/product/${product.id}`);
                    }}
                    testID={`home-product-${product.id}`}
                  />
                ))}
              </ScrollRail>
            )}

            <Button
              label={t('member.home.visitShop')}
              variant="secondary"
              fullWidth
              onPress={() => {
                router.push('/shop');
              }}
              testID="home-visit-shop"
            />
          </View>
        </HomeSection>
      </View>

      {/*
        The coach's whole profile — the SAME sheet the class screen opens
        (`components/classes/trainer-sheet.tsx`), mounted once at the screen
        level rather than per row: a `Sheet` per trainer would be three modals in
        the tree waiting for a press. `trainerId` is what opens it, so `null` is
        "closed"; `name` and `avatarUrl` are the row's own denormalised values,
        drawn while the sheet's own request is in flight.

        No `onOpenProfile`: the prop is deprecated because there is no
        `/trainers/:id` screen any more — this sheet IS the profile. The section's
        button goes to the ROSTER (`/trainers`), which does exist.
      */}
      <TrainerSheet
        gymId={gymId}
        trainerId={sheetTrainer === null ? null : sheetTrainer.id}
        name={sheetTrainer?.name ?? ''}
        avatarUrl={sheetTrainer?.avatarUrl ?? null}
        onClose={() => {
          setTrainerSheetId(null);
        }}
        testID="home-trainer-sheet"
      />
    </Screen>
  );
}

/**
 * The avatar monogram.
 *
 * `GET /me/profile` carries no photo — there is no member avatar field on the
 * contract at all — so the ring is always a monogram, and the artboard's
 * portrait is one more thing the API cannot answer. Georgian is caseless and
 * Unicode 11 maps Mkhedruli to Mtavruli, which Georgian readers parse as
 * shouting, so `trainerInitials`' rule applies here too: the shared helper is
 * reused rather than re-derived.
 */
function initialsFor(name: string | undefined): string {
  return name === undefined || name === '' ? '' : trainerInitials(name);
}
