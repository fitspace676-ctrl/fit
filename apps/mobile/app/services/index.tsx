// `/services` — the personal-training catalogue. PUBLIC: renders signed out.
//
// ===========================================================================
// COPY: the top-level `services` namespace (D10). There is no
// `member.services` — not a gap to work around, a decision: the services copy
// was authored once and both surfaces read it.
//
// ---------------------------------------------------------------------------
// THE FILTER IS `ALL | PERSONAL_TRAINING | CUSTOM`, AND IT IS AN EARLY-RETURN
// FILTER, NOT AN OVERLAY.
//
// Web hides the chips entirely while loading, on error, and on an empty
// catalogue — the opposite of `TrainersBrowser`, which keeps its filter card
// above the state block. Both are deliberate and both are kept: a type filter
// over "no services yet" narrows nothing, while a search field over a roster
// that IS there is still useful mid-load. Copying one screen's shape onto the
// other would be the kind of "looks equivalent" edit the plan keeps warning
// about.
//
// The `noMatch` vocabularies differ too, and that is also the catalogue's
// doing: `trainers.filters.noMatch` is a {title, subtitle, action} block;
// `services.filters.noMatch` is ONE bare sentence with no action. Rendered as
// written, not harmonised.
//
// ---------------------------------------------------------------------------
// ONE SCHEDULE PANEL OPEN AT A TIME (`openId`), because a list of eight
// expanded tables is a list nobody can scan — web's own accordion rule.
// ===========================================================================

import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServiceCard } from '@fit/types';
import {
  AppBar,
  Chip,
  EmptyState,
  IconButton,
  Screen,
  ScrollRail,
  Skeleton,
  Text,
  spacing,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../../components/auth/notices';
import { ServiceCardBlock } from '../../components/services/service-card';
import { SERVICES_KEY_GAP, servicesQueryOptions } from '../../hooks/queries/useServices';
import { useDiscoveryGym } from '../../hooks/useDiscoveryGym';
import { useI18n } from '../../providers/I18nProvider';

/** The three filter values, in the order the catalogue lists them. */
const TYPE_FILTERS = ['ALL', 'PERSONAL_TRAINING', 'CUSTOM'] as const;

type TypeFilter = (typeof TYPE_FILTERS)[number];

/** How many cards the loading state stands in for. */
const SKELETON_CARDS = 3;

export default function ServicesScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const gym = useDiscoveryGym();
  // The exported options factory rather than `useServices()`: that hook scopes
  // itself by the SESSION's gym and this route is public. See
  // `hooks/useDiscoveryGym.ts`.
  const catalogue = useQuery(servicesQueryOptions(gym.gymId));

  const [filter, setFilter] = useState<TypeFilter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  const services = useMemo<readonly ServiceCard[]>(
    () => catalogue.data?.services ?? [],
    [catalogue.data],
  );
  const visible = useMemo(
    () => (filter === 'ALL' ? services : services.filter((service) => service.type === filter)),
    [services, filter],
  );

  const retry = useCallback(() => {
    // The TENANT lookup is half of what can have failed here — `failed` below
    // is `gym.isError || catalogue.isError`, so a retry that re-read only the
    // catalogue would leave the error box on screen with nothing left to fix
    // it. `gym.retry()` is a no-op when there was nothing to look up.
    gym.retry();
    if (gym.gymId !== null) {
      // `SERVICES_KEY_GAP`, used AS-IS. `lib/query-keys.ts` has no `services`
      // entry — WP-7 refused to invent a sanctioned-looking key and named this
      // one so it cannot be mistaken for one. Promoting it into `queryKeys` is
      // a follow-up owed to that file's owner (plan §7), not a change this
      // screen may make.
      void queryClient.invalidateQueries({ queryKey: SERVICES_KEY_GAP(gym.gymId) });
    }
  }, [gym, queryClient]);

  const offline = catalogue.isPending && catalogue.fetchStatus === 'paused';
  const loading = gym.isPending || (catalogue.isPending && !offline && gym.gymId !== null);
  const failed = gym.isError || catalogue.isError;
  const ready = !offline && !loading && !failed;

  const header = (
    <AppBar
      // The screen's title header. Card titles are `level={4}` headers beneath
      // it, so the ordered list is [Services, …one per visible card].
      title={t('services.title')}
      subtitle={t('services.subtitle')}
      leading={
        <IconButton
          icon="chevronLeft"
          // TODO(i18n): no namespace-neutral "Back" exists. `checkout.back` is
          // real, translated copy in both locales; `common.back` is one of the
          // six shared-chrome keys the plan already lists as owed.
          accessibilityLabel={t('checkout.back')}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/home');
          }}
          testID="services-back"
        />
      }
    />
  );

  return (
    <Screen testID="services-screen" header={header}>
      <View style={{ gap: spacing[4] }}>
        {offline ? (
          // §6 STATE 4. A SKELETON HERE WAS A LIE THAT NEVER RESOLVES.
          //
          // `onlineManager` PAUSES a query rather than failing it, so with a
          // dead radio and a cold cache this branch is where the screen STAYS —
          // and a skeleton means "any moment now", which it never is. Eleven
          // other screens already render `OfflineNotice` in exactly this
          // branch; the component exists, is used, and carries the one marked
          // English placeholder the whole app shares.
          //
          // TODO(i18n): `common.offline.title` / `common.offline.body` — see
          // `components/auth/pending-copy.ts`.
          <OfflineNotice testID="services-offline" />
        ) : null}

        {loading ? (
          <View testID="services-loading" style={{ gap: spacing[3] }}>
            <CatalogueSkeleton />
          </View>
        ) : null}

        {!offline && !loading && failed ? (
          <EmptyState
            testID="services-error"
            icon="info"
            title={t('services.error')}
            action={{
              label: t('services.retry'),
              onPress: retry,
              variant: 'secondary',
              icon: 'refresh',
              testID: 'services-retry',
            }}
          />
        ) : null}

        {ready && services.length === 0 ? (
          <EmptyState
            testID="services-empty"
            icon="dumbbell"
            title={t('services.empty.title')}
            body={t('services.empty.subtitle')}
          />
        ) : null}

        {ready && services.length > 0 ? (
          <>
            <ScrollRail gap={2} testID="services-filters">
              {TYPE_FILTERS.map((value) => (
                <Chip
                  key={value}
                  label={t(`services.filters.${value}`)}
                  selected={filter === value}
                  onPress={() => {
                    setFilter(value);
                  }}
                  testID={`services-filter-${value}`}
                />
              ))}
            </ScrollRail>

            {visible.length === 0 ? (
              // ONE sentence, no action — `services.filters.noMatch` is a bare
              // string. See the header: the catalogue's own shape, kept.
              <Text variant="body" color="textSecondary" testID="services-no-match">
                {t('services.filters.noMatch')}
              </Text>
            ) : (
              <View style={{ gap: spacing[4] }} testID="services-list">
                {visible.map((service) => (
                  <ServiceCardBlock
                    key={service.id}
                    service={service}
                    expanded={openId === service.id}
                    onToggle={() => {
                      setOpenId((current) => (current === service.id ? null : service.id));
                    }}
                    onOpen={() => {
                      router.push(`/services/${service.id}`);
                    }}
                  />
                ))}
              </View>
            )}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

/** The catalogue's loading placeholder — three cards' worth. */
function CatalogueSkeleton() {
  return (
    <>
      {Array.from({ length: SKELETON_CARDS }, (_, index) => (
        <Skeleton key={index} height={220} radius={26} />
      ))}
    </>
  );
}
