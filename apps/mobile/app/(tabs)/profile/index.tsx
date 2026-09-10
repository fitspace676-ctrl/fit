// Profile — the whole account surface, on one screen.
//
// ===========================================================================
// 2026-09-09 — `/profile/settings` IS GONE, AND EVERYTHING IT HELD IS HERE.
//
// The hub screen was a second front door onto the same six destinations this
// screen already led to, plus three facts and two controls that had nowhere
// else to live. A member looking for "where do I change my language" had to
// know that Profile → Settings was a step rather than a destination. It is one
// screen now, read top to bottom:
//
//   1  IDENTITY          the block IS "Personal information" → `/profile/edit`
//   2  MEMBERSHIP        the live card; its own button → `/profile/membership`
//   3  PT CREDITS        the live strip; "Buy" → `/profile/billing`
//   4  PAYMENT HISTORY   → `/profile/billing`
//   5  NOTIFICATIONS     → `/profile/notification-settings`
//   6  MY ACTIVITY       → `/profile/activity`
//   7  ACCOUNT DETAILS   gym · role · member id, inline
//   8  LANGUAGE          the locale switch, inline
//      APPEARANCE        the light/dark switch, in the same card
//   9  SIGN OUT          confirm-first, then the version line
//
// ---------------------------------------------------------------------------
// ONE DOOR PER DESTINATION, WHICH IS WHY THERE IS NO "PERSONAL INFORMATION"
// ROW AND NO "MEMBERSHIP" ROW.
//
// The identity block already shows the member's face, name and plan and opens
// the editor; the membership card already carries "Manage plan". A menu row
// repeating either — directly under the block it repeats — is the nine-row
// screen this one was cut down from on 2026-09-05.
//
// Payment history is NOT that duplication. The PT strip's "Buy" is a purchase
// action, not a door onto invoices, and nobody looking for last month's
// receipt presses it.
//
// ---------------------------------------------------------------------------
// WHAT DID NOT COME BACK WITH THE HUB.
//
//   * `trainers` / `personal training` — both are on Home (`home.tsx:376`,
//     `:427`). The hub's copies were the second and third.
//   * `bookings` — moved to the Classes tab.
//   * `goals` — `/profile/goals` still exists and still renders; the hub was
//     its only link, and it now has none. Left standing rather than deleted:
//     the screen is written, and a row for it belongs wherever goals are
//     eventually surfaced, not tacked onto a list this long.
//   * The notification-preference switches, for the reason they never shipped:
//     there is no notification-preferences controller on the API at all (plan
//     §7). `/profile/notification-settings` answers that question honestly,
//     behind a disclaimer, and row 5 is its door.
//
// THE APPEARANCE SWITCH DID COME BACK, on 2026-09-09, because the thing that
// kept it out went away: Q5's "dark only for v1" is over, the light map in
// `tokens/semantic.ts` was always complete, and a light comp is no longer what
// the decision waits on. It is two values — light and dark, no "follows
// system" — stored on the device by `lib/theme-preference.ts`, exactly as the
// member portal's header control works. A switch that does nothing is worse
// than no switch; this one does something.
//
// ---------------------------------------------------------------------------
// The gym name is decoration; the member id is not. A failed gym lookup
// renders an inline retry and leaves every other row intact, rather than
// taking the account block — or the screen — down with it.
//
// TWO OF THE ARTBOARD'S FIGURES ARE STILL NOT HERE, AND THAT IS THE FINDING.
// `stats.dayStreak` and `achievements.streak` need a check-in log the API does
// not expose to a member (`admin/check-ins` is `MemberRead` / `MemberWrite`).
// See `components/profile/stats.tsx`. Filling them with `min(attended, 30)` —
// which is what the web dashboard does — would be `22 / 30` again.
//
// The QR row is absent too, and so is the QR BUTTON the artboard draws on the
// membership block: both went with `/qr` on 2026-08-31 (Q1). Their absence is
// asserted, so reinstating either is a deliberate act with a test to answer to.
//
// ONE SHEET. `Sheet` is single-instance per screen — two overlapping `Modal`s
// flash black on iOS — so the freeze sheet is driven by one boolean and the
// sign-out confirmation, which is the screen's only other overlay, is a
// `ConfirmSheet` that cannot be open at the same time as it (they are opened
// by two rows a scroll apart).
// ===========================================================================

import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AppBar,
  Avatar,
  Button,
  Icon,
  IconButton,
  ListRow,
  Screen,
  SectionHeader,
  Segmented,
  Skeleton,
  Surface,
  Text,
  layout,
  spacing,
  useToast,
} from '@fit/ui-mobile';
import type { Locale } from '@fit/i18n';

import appJson from '../../../app.json';
import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import { PROFILE_PENDING_COPY } from '../../../components/home/pending-copy';
import { HomeSection, sectionPhase } from '../../../components/home/section';
import { creditBalance } from '../../../components/membership/derive';
import { FreezeSheet } from '../../../components/membership/freeze-sheet';
import { ProfileMembershipCard } from '../../../components/membership/membership-card';
import { ProfilePtStrip } from '../../../components/profile/stats';
import { SignOutSection } from '../../../components/settings/sign-out-section';
import { trainerInitials } from '../../../components/trainers/trainer-filters';
import { useCreditPacks, useMembership } from '../../../hooks/queries/useMembership';
import { useGymBySlug } from '../../../hooks/queries/useGym';
import { useMyProfile } from '../../../hooks/queries/useAccount';
import { useUnreadCount } from '../../../hooks/queries/useNotifications';
import { useUnfreezeSubscription } from '../../../hooks/mutations/useSubscriptionMutations';
import { useGymId } from '../../../hooks/useActiveGym';
import { useSession } from '../../../hooks/useSession';
import { resolveGymSlug, signOut } from '../../../lib/auth/session';
import { queryKeys } from '../../../lib/query-keys';
import type { ThemePreference } from '../../../lib/theme-preference';
import { useI18n } from '../../../providers/I18nProvider';
import { useThemePreference } from '../../../providers/ThemePreferenceProvider';

/**
 * The six roles `settings.account.roles` carries labels for.
 *
 * `session.role` is a bare `string` (it is whatever the token said), so this
 * list is the narrowing that lets a role be turned into a typed message key.
 * An unrecognised role falls back to the raw value rather than rendering the
 * key path — which is the failure the typed key space exists to prevent, and
 * which a template literal alone would not catch.
 */
const ROLES = ['MEMBER', 'TRAINER', 'RECEPTIONIST', 'MANAGER', 'OWNER', 'SUPER_ADMIN'] as const;

type KnownRole = (typeof ROLES)[number];

function isKnownRole(value: string): value is KnownRole {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * The app version, read from `app.json` rather than `expo-constants`.
 *
 * Same value for a given binary, no native module in the path, and it survives
 * a render test with no Expo runtime — which matters because the footer line is
 * one of the things this screen's test asserts.
 */
const APP_VERSION = appJson.expo.version;

export default function ProfileScreen() {
  const { t, locale, setLocale, locales, localeNames } = useI18n();
  const { preference, preferences, setPreference } = useThemePreference();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useIsOnline();
  const gymId = useGymId();
  const scoped = gymId ?? '';
  const session = useSession();

  // Pinned, so every "days left" on this screen agrees with every other.
  const [now] = useState(() => new Date());
  const [freezeOpen, setFreezeOpen] = useState(false);

  const profile = useMyProfile();
  const membership = useMembership();
  const packs = useCreditPacks();
  const unread = useUnreadCount();
  const unfreeze = useUnfreezeSubscription();

  const gymSlug = resolveGymSlug() ?? null;
  const gym = useGymBySlug(gymSlug);
  /**
   * The lookup is genuinely in flight — as opposed to "there is no slug to look
   * up", where `settings.account.noGym` is the true answer rather than a
   * placeholder standing in for one.
   *
   * `useGymBySlug(null)` is DISABLED, so `isPending` is true forever there; the
   * slug check is what keeps this from skeletoning for the session.
   */
  const gymPending = gymSlug !== null && gym.isPending && !gym.isError;

  const invalidate = useCallback(
    (key: readonly unknown[]) => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
    [queryClient],
  );

  const credits = useMemo(() => creditBalance(packs.data?.packs), [packs.data]);

  const subscription = membership.data?.subscription ?? null;
  const memberName = profile.data?.profile.name?.trim() ?? '';
  const unreadCount = unread.data?.unread ?? 0;

  const membershipPhase = sectionPhase(membership, online);
  const creditsPhase = sectionPhase(packs, online);
  const identityPhase = sectionPhase(profile, online);

  const roleLabel =
    session.role === null
      ? undefined
      : isKnownRole(session.role)
        ? t(`settings.account.roles.${session.role}`)
        : session.role;

  const resume = useCallback(() => {
    if (subscription === null || unfreeze.isPending) return;
    unfreeze.mutate(
      { subscriptionId: subscription.id },
      {
        onSuccess: () => {
          toast.success(t('member.membership.freeze.resumedToast'));
        },
        onError: () => {
          toast.error(t('member.membership.freeze.errGeneric'));
        },
      },
    );
  }, [subscription, unfreeze, toast, t]);

  return (
    <Screen
      testID="profile-screen"
      header={
        <AppBar
          // The screen's one AppBar heading. Sections add their own.
          title={t('member.profile.mobile.title')}
          trailing={
            <IconButton
              icon="bell"
              accessibilityLabel={t('member.profile.mobile.notificationsA11y')}
              onPress={() => {
                router.push('/profile/notifications');
              }}
              {...(unreadCount > 0 ? { badge: { count: unreadCount } } : {})}
              testID="profile-notifications"
            />
          }
        />
      }
    >
      <View style={{ gap: layout.sectionGap }}>
        {online ? null : <OfflineNotice testID="profile-offline" />}

        {/* ── 1 · Identity ───────────────────────────────────────────────── */}
        <HomeSection
          testID="profile-identity"
          phase={identityPhase}
          onRetry={() => {
            invalidate(queryKeys.profile(scoped));
          }}
          skeleton={<Skeleton height={72} radius="page" />}
        >
          {/* ====================================================================
              THE IDENTITY BLOCK IS THE "PERSONAL INFORMATION" ROW.

              A menu row titled "Personal information", sitting under a block
              that already shows the member's face, their name and their plan,
              is a second door onto the same room. Tapping your own name to edit
              it is the platform convention (iOS Settings, every app that copied
              it), and it buys back a whole row.

              A `Pressable` rather than a `ListRow`: the row component draws a
              40pt plate, and what belongs here is the 72pt avatar. The chevron
              is imported so the affordance is not lost — a tappable area with
              no mark on it is a tappable area nobody taps.

              `DECORATIVE` is not exported from the kit, so the children are
              taken out of the tree with `accessible={false}` on the wrapper's
              content and the ROW carries the spoken name — the same contract
              `ListRow` has, spelled out here.
              ==================================================================== */}
          <Pressable
            testID="profile-row-edit"
            accessibilityRole="button"
            accessibilityLabel={memberName === '' ? t('member.profile.mobile.member') : memberName}
            accessibilityHint={t('member.profile.mobile.menu.profile')}
            onPress={() => {
              router.push('/profile/edit');
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}
            >
              <Avatar
                size={72}
                ring="accent"
                initials={memberName === '' ? '' : trainerInitials(memberName)}
                accessibilityLabel={
                  memberName === '' ? t('member.profile.mobile.member') : memberName
                }
                testID="profile-avatar"
              />
              <View style={{ flex: 1, minWidth: 0, gap: spacing[2] }}>
                {/* The member's own name is IDENTITY, not a landmark: `Heading`
                    would emit a second `role="header"` competing with the screen
                    title for the same rank, and RN has no `accessibilityLevel` to
                    tell them apart. See §6 item 7 as amended. */}
                <Text variant="heading" testID="profile-name">
                  {memberName === '' ? t('member.profile.mobile.member') : memberName}
                </Text>
                {/* `memberSince` is `"{tier} · since {year}"` and BOTH halves are
                    real: the tier is the plan's own name (or the status label for
                    a bespoke plan) and the year is `GymMember.joinedAt`, which
                    rides on `GET /me/subscription`. A member with no subscription
                    has no `memberSince` on the wire, so the line is omitted
                    rather than filled with the current year. */}
                {subscription === null ? null : (
                  <Text variant="bodySmall" color="textSecondary" testID="profile-member-since">
                    {t('member.profile.mobile.memberSince', {
                      tier:
                        subscription.planName ??
                        t(`member.membership.status.${subscription.status}`),
                      year: new Date(subscription.memberSince).getUTCFullYear(),
                    })}
                  </Text>
                )}
              </View>
              {/* `iconDisabled` at 16pt — the same chevron `ListRow` draws, and
                  named the same way, so the identity row and the rows under it
                  cannot end up with two different affordances. */}
              <Icon
                name="chevronRight"
                size={16}
                color="iconDisabled"
                testID="profile-edit-chevron"
              />
            </View>
          </Pressable>
        </HomeSection>

        {/* ── 2 · Membership ─────────────────────────────────────────────── */}
        <HomeSection
          testID="profile-membership"
          phase={membershipPhase}
          onRetry={() => {
            invalidate(queryKeys.membership(scoped));
          }}
          skeleton={<Skeleton height={230} radius="page" />}
        >
          {membership.data === undefined ? null : (
            <ProfileMembershipCard
              data={membership.data}
              now={now}
              busy={unfreeze.isPending}
              onFreeze={() => {
                setFreezeOpen(true);
              }}
              onResume={resume}
              onManage={() => {
                router.push('/profile/membership');
              }}
            />
          )}
        </HomeSection>

        {/* ── 3 · PT credits ─────────────────────────────────────────────── */}
        <HomeSection
          testID="profile-credits"
          phase={creditsPhase}
          onRetry={() => {
            invalidate(queryKeys.creditPacks(scoped));
          }}
          skeleton={<Skeleton height={110} radius={26} />}
        >
          <ProfilePtStrip
            remaining={credits.remaining}
            hasPacks={credits.hasPacks}
            onBuy={() => {
              router.push('/profile/billing');
            }}
          />
        </HomeSection>

        {/* ── 4–6 · The menu, three rows long ────────────────────────────

            No `SectionHeader` above it. `menu.heading` and `settings.title`
            are the same word in both locales, and the heading sat one line
            above the row: "პარამეტრები" over "პარამეტრები". Three rows under
            three blocks need no label to be found. ────────────────────── */}
        <Surface tone="card" padVertical={1}>
          <ListRow
            icon="card"
            title={t('member.profile.mobile.menu.payments')}
            hint={t('member.profile.mobile.menu.billingHint')}
            onPress={() => {
              router.push('/profile/billing');
            }}
            testID="profile-row-payments"
          />

          <ListRow
            icon="bell"
            title={t('member.profile.mobile.menu.notificationSettings')}
            hint={t('member.profile.mobile.menu.notificationsHint')}
            onPress={() => {
              router.push('/profile/notification-settings');
            }}
            testID="profile-row-notification-settings"
          />

          {/* The counters and the achievement rail used to be a section on this
              screen, between the PT strip and the menu. They are two numbers a
              member reads occasionally and cannot act on, and they cost the
              screen a whole scroll — so they are a subpage, and this row is the
              door. It carries no figure: a live count here would need
              `useMyBookings('all')` back on this screen for a number nobody
              asked to see, and a stale one is worse than none. */}
          <ListRow
            icon="chart"
            title={t('member.profile.mobile.menu.activity')}
            hint={t('member.profile.mobile.menu.activityHint')}
            onPress={() => {
              router.push('/profile/activity');
            }}
            testID="profile-row-activity"
          />
        </Surface>

        {/* ── 7 · Account details ────────────────────────────────────────── */}
        <View style={{ gap: spacing[3] }}>
          <SectionHeader title={t('member.profile.mobile.menu.accountHeading')} />

          {gym.isError ? (
            // TODO(i18n): `errors.generic` is the one namespace-neutral error
            // block in the catalogues. A `settings.error` / `settings.retry`
            // pair does not exist; nothing is invented here.
            <Alert
              testID="profile-gym-error"
              tone="warning"
              title={t('errors.generic.badge')}
              body={t('errors.generic.description')}
            >
              <Button
                label={t('errors.generic.tryAgain')}
                onPress={() => {
                  if (gymSlug !== null) {
                    invalidate(queryKeys.gymBySlug(gymSlug));
                  }
                }}
                variant="secondary"
                size="sm"
                testID="profile-gym-retry"
              />
            </Alert>
          ) : null}

          <Surface tone="card" padVertical={1}>
            <ListRow
              icon="briefcase"
              title={t('settings.account.gym')}
              // ==========================================================
              // "No gym" IS AN ANSWER, SO IT MAY NOT STAND IN FOR ONE.
              //
              // `?? t('settings.account.noGym')` covered all three shapes of
              // "no name yet" — in flight, failed, and genuinely gymless — and
              // the first of those is a DEFAULT RENDERED AS DATA: the row
              // states, in the member's own language, that they belong to no
              // gym, while the request that would say otherwise is still on the
              // wire. (The failed case already has its own retry above.)
              //
              // A skeleton says the one true thing instead: not known yet.
              // ==========================================================
              {...(gymPending
                ? {
                    trailing: (
                      <Skeleton
                        width={104}
                        height={14}
                        // TODO(i18n) `member.profile.mobile.loading` — see
                        // `components/home/pending-copy.ts`.
                        accessibilityLabel={PROFILE_PENDING_COPY.loading}
                        testID="profile-gym-loading"
                      />
                    ),
                  }
                : { value: gym.data?.name ?? t('settings.account.noGym') })}
              testID="profile-gym"
            />
            {roleLabel === undefined ? null : (
              <ListRow
                icon="shield"
                title={t('settings.account.role')}
                value={roleLabel}
                testID="profile-role"
              />
            )}
            <ListRow
              icon="user"
              title={t('settings.account.memberId')}
              // The access token's `sub`. There is no short human member code
              // on the API at all, so this is the id a member reads out at the
              // front desk for staff to enter in the admin console.
              value={session.userId ?? ''}
              testID="profile-member-id"
            />
          </Surface>
        </View>

        {/* ── 8 · Language and appearance ────────────────────────────────

            No `SectionHeader`: each `Segmented`'s own label is the control's
            name and a heading above them would say the same word twice, which
            is the trap the removed "Settings" heading fell into.

            ONE CARD, TWO ROWS. They are the same kind of thing — a device
            preference the member sets once, stored on the phone, answered
            instantly, nothing on the wire — and every other card on this screen
            groups by kind. A second card for one more switch would also put
            appearance below sign-out or above it, and neither is where a member
            looks for it. ────────────────────────────────────────────────── */}
        <Surface tone="card" padding={4} style={{ gap: spacing[4] }}>
          <View style={{ gap: spacing[3] }}>
            <Text variant="label" color="textSecondary">
              {t('member.profile.mobile.menu.language')}
            </Text>
            <Segmented
              label={t('member.profile.mobile.menu.language')}
              value={locale}
              onChange={(next: Locale) => {
                setLocale(next);
              }}
              options={locales.map((value) => ({ value, label: localeNames[value] }))}
              testID="profile-language"
            />
          </View>

          {/* ================================================================
              DARK FIRST, AND THE OPTIONS ARE NOUNS.

              Dark leads because dark is the default and the product; a control
              whose first cell is the mode you are almost certainly in is one
              nobody has to read twice. The labels are "Dark" / "Light" rather
              than the portal header's "Switch to dark" — a segmented control
              STATES the current mode and offers the other, so a verb on the
              selected cell would be describing an action that has already
              happened. (That is the same reason the portal chose a segmented
              control over a lone toggle: `member/theme-toggle.tsx:9`.)

              `member.profile.mobile.menu.appearanceHint` — "Follows system" —
              is deliberately NOT rendered. There is no `system` option: the
              member's choice is the answer, not the phone's.
              ================================================================ */}
          <View style={{ gap: spacing[3] }}>
            <Text variant="label" color="textSecondary">
              {t('member.profile.mobile.menu.appearance')}
            </Text>
            <Segmented
              label={t('member.profile.mobile.menu.appearance')}
              value={preference}
              onChange={(next: ThemePreference) => {
                setPreference(next);
              }}
              options={preferences.map((value) => ({
                value,
                label: t(`member.profile.mobile.appearance.${value}`),
                icon: value === 'dark' ? ('moon' as const) : ('sun' as const),
              }))}
              testID="profile-appearance"
            />
          </View>
        </Surface>

        {/* ── 9 · Sign out, then the version ─────────────────────────────── */}
        <View style={{ gap: spacing[3] }}>
          <Surface tone="card" padVertical={1}>
            <SignOutSection
              onSignOut={signOut}
              onSignedOut={() => {
                // Not a decision about WHERE. `signOut()` publishes
                // `signed-out` to the session store, and the root guard's
                // `resolveRedirect` moves the user; `/` is the nudge that
                // makes it re-evaluate now rather than on the next navigation.
                router.replace('/');
              }}
              testID="profile-sign-out"
            />
          </Surface>

          {/* The last line on the screen, and the smallest. It is not a row:
              nothing opens, nothing is copied, and a member only ever reads it
              out loud to support. `caption` at 12pt, centred, secondary. */}
          <Text
            variant="caption"
            color="textSecondary"
            style={{ textAlign: 'center' }}
            testID="profile-version"
          >
            {t('member.profile.mobile.version', { version: APP_VERSION })}
          </Text>
        </View>
      </View>

      <FreezeSheet
        open={freezeOpen}
        onClose={() => {
          setFreezeOpen(false);
        }}
        subscription={subscription}
        now={now}
      />
    </Screen>
  );
}
