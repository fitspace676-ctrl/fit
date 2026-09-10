// @fit/mobile — Home's counter row. `mobile-home-v2.tsx:270-300`.
//
// ===========================================================================
// TWO TILES, AND THE ARTBOARD'S FIRST ONE IS NOT ONE OF THEM.
//
// The artboard draws "დღის სერია" (day streak) beside "PT კრედიტი". The streak
// **cannot be computed**: it needs a check-in log, and the only check-in
// surface on the API is `@Controller('admin/check-ins')` behind `MemberRead` /
// `MemberWrite`, which a `MEMBER` token cannot call. That is the same finding
// that closed Q1 and removed the QR screen (plan §7), and it applies here for
// the same reason.
//
// The web dashboard fills the hole with `Math.min(attendedCount, 30)`. That is
// not a streak — it is the attended count wearing a streak's label — and
// shipping it would be `22 / 30` again with extra steps. So the tile is ABSENT,
// `member.home.dayStreak` and `member.home.checkInsMonth` go unread, and the
// strip is two REAL figures:
//
//   `member.home.classesBooked`  the member's upcoming bookings — rows in
//                                `GET /me/bookings`, counted.
//   `member.home.ptCredits`      the live PT-credit balance across every pack,
//                                from `GET /members/me/credit-packs`. Booking a
//                                class spends one of these, which is why the
//                                invalidation matrix refreshes it on every
//                                booking — this tile is the thing that used to
//                                go stale.
//
// ---------------------------------------------------------------------------
// EACH TILE IS **ONE** ACCESSIBILITY NODE, AND THE PIPS ARE INSIDE IT.
//
// `StatTile` collapses to a single node on purpose: split into its visible
// parts, VoiceOver reads "two" and then, as an unrelated stop, "PT" — the
// figure spelled out as a tabular mono run, the caption detached from what it
// captions. The pip row is decoration carrying the same number, so it is hidden
// on both platforms rather than announced twice.

import { View } from 'react-native';
import { Pips, StatTile, TileGrid, spacing } from '@fit/ui-mobile';

import { useI18n } from '../../providers/I18nProvider';
import type { CreditBalance } from '../membership/derive';

/** Above this many credits the pip row is noise, so only the figure is drawn. */
const MAX_PIPS = 8;

export interface HomeStatStripProps {
  /** Upcoming bookings — the count, not the rows. */
  upcomingCount: number;
  /** The live PT-credit balance. */
  credits: CreditBalance;
  testID?: string;
}

/** Home's two counters. */
export function HomeStatStrip({
  upcomingCount,
  credits,
  testID = 'home-stats',
}: HomeStatStripProps) {
  const { t } = useI18n();

  const creditsLabel = t('member.home.ptCredits');
  const showPips = credits.total > 0 && credits.total <= MAX_PIPS;

  return (
    <TileGrid testID={testID} columns={2} gap={3}>
      <StatTile
        testID={`${testID}-classes`}
        label={t('member.home.classesBooked')}
        value={String(upcomingCount)}
        accessibilityLabel={`${t('member.home.classesBooked')}: ${String(upcomingCount)}`}
      />
      <StatTile
        testID={`${testID}-credits`}
        label={creditsLabel}
        value={String(credits.remaining)}
        {...(credits.total > 0 ? { suffix: `/${String(credits.total)}` } : {})}
        // The whole sentence, because the tile is one node and the pips beside
        // the figure say the same thing silently.
        accessibilityLabel={
          credits.total > 0
            ? `${creditsLabel}: ${String(credits.remaining)}/${String(credits.total)}`
            : `${creditsLabel}: ${String(credits.remaining)}`
        }
        {...(showPips
          ? {
              trailing: (
                <View
                  // Decoration. Hidden on iOS and on Android by their separate
                  // mechanisms — `StatTile` already collapses, and a nested
                  // labelled node would break that.
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{ marginBottom: spacing[1] }}
                >
                  <Pips
                    filled={credits.remaining}
                    total={credits.total}
                    accessibilityLabel={creditsLabel}
                  />
                </View>
              ),
            }
          : {})}
      />
    </TileGrid>
  );
}
