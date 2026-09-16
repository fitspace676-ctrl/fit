// @fit/mobile — Profile's counters, achievement rail and PT-credit strip.
//
// `mobile-profile.tsx:225-300`, on the only member-readable facts there are.
//
// ===========================================================================
// TWO OF THE ARTBOARD'S FIVE FIGURES CANNOT BE COMPUTED, AND ARE ABSENT.
//
// `member.profile.mobile.stats` names three tiles — `dayStreak`, `totalVisits`,
// `classes` — and `achievements` names five badges including a `streak`. Both
// streak figures need a CHECK-IN LOG, and there is none a member can read: the
// only check-in surface on the API is `@Controller('admin/check-ins')` behind
// `MemberRead` / `MemberWrite`. That is the same finding that closed Q1 and
// removed the QR screen (plan §7).
//
// So `stats.dayStreak` and `achievements.streak` go unread and their tiles are
// not drawn. The alternative — the web dashboard's `Math.min(attended, 30)` —
// is the attended count wearing a streak's label, and shipping it would be
// `22 / 30` with extra steps.
//
// WHAT IS LEFT IS REAL, AND IT COMES FROM ONE ENDPOINT:
//
//   `stats.totalVisits`  bookings whose status is `ATTENDED`. Staff mark the
//                        roster (`POST /admin/class-instances/:id/attendance`)
//                        and the member's own history echoes the result, so
//                        this is a recorded attendance, not an estimate. It is
//                        classes attended rather than doors opened — the
//                        nearest true reading of "total visits" this API
//                        supports, and it is stated here rather than implied.
//   `stats.classes`      every booking the member has ever made, in any state.
//   the achievements     earned from that same attended count: 1 / 10 / 50 /
//                        100. The thresholds are the badge NAMES
//                        (`tenVisits`, `fiftyVisits`, `hundredVisits`), so the
//                        ladder is copy-driven rather than invented.
//
// ---------------------------------------------------------------------------
// `AchievementTile` TAKES A REQUIRED `statusLabel` AND THAT IS NOT BOILERPLATE.
//
// Earned versus locked is a COLOUR SWAP and nothing else on the artboard — no
// text, no icon change. Without a spoken status a screen-reader user hears the
// same four words whether they have earned all four or none. There is no
// earned/locked pair in `member.profile.mobile.achievements` — nor anywhere
// else in either catalogue — so the marked English placeholders in
// `components/home/pending-copy.ts` are used and the keys are owed.

import { View } from 'react-native';
import {
  AchievementTile,
  Button,
  Eyebrow,
  ScrollRail,
  SectionHeader,
  StatTile,
  Surface,
  Text,
  TileGrid,
  spacing,
  type IconName,
} from '@fit/ui-mobile';

import { PROFILE_PENDING_COPY } from '../home/pending-copy';
import { useI18n } from '../../providers/I18nProvider';

/** Achievement key → the attended count that earns it. */
const LADDER = [
  { key: 'firstClass', at: 1, icon: 'medal' },
  { key: 'tenVisits', at: 10, icon: 'medal' },
  { key: 'fiftyVisits', at: 50, icon: 'award' },
  { key: 'hundredVisits', at: 100, icon: 'star' },
] as const satisfies readonly { key: string; at: number; icon: IconName }[];

export interface ProfileStatsProps {
  /** Bookings whose status is `ATTENDED`. */
  attended: number;
  /** Every booking the member has ever made. */
  bookings: number;
  testID?: string;
}

/** The two computable counters. */
export function ProfileStatStrip({
  attended,
  bookings,
  testID = 'profile-stats',
}: ProfileStatsProps) {
  const { t } = useI18n();

  const visitsLabel = t('member.profile.mobile.stats.totalVisits');
  const classesLabel = t('member.profile.mobile.stats.classes');

  return (
    <TileGrid testID={testID} columns={2} gap={3}>
      <StatTile
        testID={`${testID}-visits`}
        label={visitsLabel}
        value={String(attended)}
        accessibilityLabel={`${visitsLabel}: ${String(attended)}`}
      />
      <StatTile
        testID={`${testID}-classes`}
        label={classesLabel}
        value={String(bookings)}
        accessibilityLabel={`${classesLabel}: ${String(bookings)}`}
      />
    </TileGrid>
  );
}

/**
 * The PT-credit strip. `mobile-profile.tsx:225-250`.
 *
 * The balance is live (`GET /members/me/credit-packs`) and a class booking
 * SPENDS one, which is why the invalidation matrix refreshes this key on
 * `bookClass` / `cancelBooking` as well as on a purchase — the gap that made
 * the deleted app show the opening balance after three bookings.
 *
 * The buy button goes to Billing rather than opening a purchase sheet here:
 * `billing.credits.*` is a complete 17-key set (loading, error, empty,
 * confirm, toasts) and duplicating half of it on Profile is how two screens
 * start disagreeing about what a pack costs.
 */
export function ProfilePtStrip({
  remaining,
  hasPacks,
  onBuy,
  testID = 'profile-pt',
}: {
  remaining: number;
  hasPacks: boolean;
  onBuy: () => void;
  testID?: string;
}) {
  const { t, plural } = useI18n();

  return (
    <Surface tone="card" padding={5} border testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
        <View style={{ flex: 1, minWidth: 0, gap: spacing[2] }}>
          <Eyebrow size="label" color="textSecondary">
            {t('member.profile.mobile.menu.training')}
          </Eyebrow>
          {/* `Text variant="section"`, not `Heading`: this is a FIGURE inside a
              card, not a landmark a screen-reader user should be able to jump
              to. `Heading` emits `accessibilityRole="header"`, and a screen
              whose header list is polluted by every card's headline is a screen
              whose header list is useless — which is what §6 item 7, as
              amended, is protecting. */}
          <Text variant="section" testID={`${testID}-balance`}>
            {remaining > 0
              ? plural('member.profile.mobile.pt.sessionsLeft', remaining)
              : t('member.profile.mobile.pt.none')}
          </Text>
          <Text variant="caption" color="textSecondary">
            {remaining > 0 || hasPacks
              ? t('member.profile.mobile.pt.refreshesActive')
              : t('member.profile.mobile.pt.refreshesEmpty')}
          </Text>
        </View>
        <Button
          label={t('member.profile.mobile.pt.buy')}
          onPress={onBuy}
          size="sm"
          testID={`${testID}-buy`}
        />
      </View>
    </Surface>
  );
}

/** The horizontal achievement rail, earned from the attended count. */
export function ProfileAchievements({
  attended,
  testID = 'profile-achievements',
}: {
  attended: number;
  testID?: string;
}) {
  const { t } = useI18n();

  return (
    <View style={{ gap: spacing[3.5] }} testID={testID}>
      <SectionHeader title={t('member.profile.mobile.achievements.title')} size="md" />
      {/*
        ====================================================================
        `alignItems: 'flex-start'`, AT THE CALL SITE.
        //
        `ScrollRail` centres its items, which is right for the two rails it was
        drawn for: a week strip of identical 76pt day cells and a run of
        identical 40pt chips, where centring and top-aligning are the same
        picture. Achievement tiles are NOT identical — a caption that wraps to
        two lines makes the first tile 16pt taller than its neighbours, and
        centring then pushed it 8pt UP, so the plates in the row did not line up
        and neither did the captions under them. One ragged tile, and the rail
        reads as broken rather than as varied.
        //
        Fixed here rather than in `ScrollRail`, because the component's default
        is correct for its other three consumers; what is wrong is only that
        THIS rail holds items of unequal height.
        ====================================================================
      */}
      <ScrollRail
        testID={`${testID}-rail`}
        gap={2.5}
        contentContainerStyle={{ alignItems: 'flex-start' }}
      >
        {LADDER.map((badge) => {
          const earned = attended >= badge.at;
          return (
            <AchievementTile
              key={badge.key}
              testID={`${testID}-${badge.key}`}
              label={t(`member.profile.mobile.achievements.${badge.key}`)}
              icon={badge.icon}
              earned={earned}
              // TODO(i18n): `member.profile.mobile.achievements.earned` /
              // `.locked`. There is no earned/locked pair anywhere in either
              // catalogue — see `components/home/pending-copy.ts`, which holds
              // this stage's English placeholders in one place so closing the
              // gap is a delete plus a `t()`.
              statusLabel={
                earned
                  ? PROFILE_PENDING_COPY.achievementEarned
                  : PROFILE_PENDING_COPY.achievementLocked
              }
            />
          );
        })}
      </ScrollRail>
    </View>
  );
}
