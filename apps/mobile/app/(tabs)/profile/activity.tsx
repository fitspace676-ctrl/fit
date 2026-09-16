// `/profile/activity` — the two counters and the achievement rail.
//
// ===========================================================================
// WHY THIS IS A SCREEN AND NOT A SECTION.
//
// Both blocks were on `/profile` itself, between the PT strip and the menu,
// and together they cost the first screen a full scroll: two `StatTile`s in a
// grid, a `SectionHeader`, and a rail of four `AchievementTile`s whose Georgian
// captions wrap to two lines. What they hold is a pair of figures a member
// reads occasionally, is pleased by, and CANNOT ACT ON — there is no button on
// either of them. That is the exact shape of a subpage: worth keeping, not
// worth the first screenful.
//
// Nothing about the blocks themselves changed. `components/profile/stats.tsx`
// is imported unaltered, its `ScrollRail` still top-aligns for the reason
// stated there, and the two figures still come off the one endpoint a member
// can read (see that file for the full account of the two the artboard draws
// and the API cannot answer).
//
// ---------------------------------------------------------------------------
// ONE QUERY, ONE SECTION, ONE PHASE. `useMyBookings('all')` is the whole
// screen, so there is exactly one `HomeSection` and its four branches are the
// screen's four states. The retry invalidates `queryKeys.bookings` — the same
// root every booking mutation writes through — and never calls `.refetch()`.

import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AppBar, IconButton, Screen, Skeleton, layout } from '@fit/ui-mobile';

import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import { attendedCount, totalBookings } from '../../../components/home/derive';
import { HomeSection, sectionPhase } from '../../../components/home/section';
import { ProfileAchievements, ProfileStatStrip } from '../../../components/profile/stats';
import { useMyBookings } from '../../../hooks/queries/useBookings';
import { useGymId } from '../../../hooks/useActiveGym';
import { queryKeys } from '../../../lib/query-keys';
import { useI18n } from '../../../providers/I18nProvider';

export default function ActivityScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const gymId = useGymId();
  const scoped = gymId ?? '';

  const bookings = useMyBookings('all');

  const attended = useMemo(() => attendedCount(bookings.data?.bookings), [bookings.data]);
  const booked = useMemo(() => totalBookings(bookings.data?.bookings), [bookings.data]);

  const retry = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings(scoped) });
  }, [queryClient, scoped]);

  return (
    <Screen
      testID="activity-screen"
      header={
        <AppBar
          // The screen's one `role="header"`. The achievement rail adds its own
          // heading under it, which is the section rank rather than the screen's.
          title={t('member.profile.mobile.menu.activity')}
          subtitle={t('member.profile.mobile.menu.activityHint')}
          leading={
            <IconButton
              icon="chevronLeft"
              // TODO(i18n): no namespace-neutral "Back" exists — the string is
              // spelled in eight namespaces and none of them is shared chrome.
              // `notifications.back` is the sibling screen in this same stack,
              // which is the choice `settings.tsx` and `goals.tsx` already made.
              accessibilityLabel={t('notifications.back')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/profile');
              }}
              variant="surface"
              testID="activity-back"
            />
          }
        />
      }
    >
      <View style={{ gap: layout.sectionGap }}>
        {online ? null : <OfflineNotice testID="activity-offline" />}

        <HomeSection
          testID="activity-stats"
          phase={sectionPhase(bookings, online)}
          onRetry={retry}
          skeleton={<Skeleton height={92} radius={22} />}
        >
          <View style={{ gap: layout.sectionGap }}>
            <ProfileStatStrip attended={attended} bookings={booked} />
            <ProfileAchievements attended={attended} />
          </View>
        </HomeSection>
      </View>
    </Screen>
  );
}
