import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import type { PackageSummary } from '@fit/types';
import { useI18n, useTheme, useToast } from '../../../providers';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { usePackages } from '../../../hooks/usePackages';
import { useMemberBookings } from '../../../hooks/useMemberBookings';
import { PackageCard } from '../../../components/packages/PackageCard';
import { BookingCard } from '../../../components/bookings/BookingCard';
import { checkout } from '../../../lib/checkout';

/**
 * Personal Training screen (T6.6), reachable from the Profile tab. Two sections
 * backed by independent reads:
 *
 *   • **Packages** — the gym's personal-training offerings (`GET /packages`,
 *     `usePackages`), rendered as informational cards (price, sessions, perks).
 *   • **Upcoming sessions** — the member's upcoming bookings
 *     (`GET /me/bookings?scope=upcoming`, reusing `useMemberBookings`), each card
 *     deep-linking to the class detail (`/classes/:id`).
 *
 * Each section degrades on its own: a spinner while its read loads, a retryable
 * error, and an empty state. Pull-to-refresh revalidates both. Colours come from
 * `useTheme()`, so the screen tracks system dark mode like the rest of the app.
 */
export default function TrainingScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const packages = usePackages(gymId);
  const bookings = useMemberBookings(gymId, 'upcoming');

  // The id of the plan being bought, so only its own card spins while every
  // other button dims — one purchase at a time, and it is obvious which one.
  const [buyingId, setBuyingId] = useState<string | null>(null);

  /**
   * Buy `pkg` behind a confirmation. The prompt says the payment is settled at
   * the gym, because it is: `POST /checkout` reserves the membership but there
   * is no gateway behind it yet, and a button that reads like it charges a card
   * would be a lie.
   *
   * The API's coded failures each get their own sentence — "no longer on sale"
   * and "you already have a membership" are things the member can act on, and
   * collapsing them into one generic error would strand them.
   */
  const onBuy = useCallback(
    (pkg: PackageSummary) => {
      Alert.alert(
        t('training.packages.confirmTitle', { name: pkg.name }),
        t('training.packages.confirmBody'),
        [
          { text: t('training.packages.cancel'), style: 'cancel' },
          {
            text: t('training.packages.confirmCta'),
            style: 'default',
            onPress: () => {
              setBuyingId(pkg.id);
              void checkout({ productType: 'package', productId: pkg.id })
                .then((result) => {
                  if (result.ok) {
                    toast.success(t('training.packages.boughtToast', { name: pkg.name }));
                    // The purchase changes what the member holds, so re-read the
                    // catalogue (a one-per-member plan may drop off it).
                    void packages.refetch();
                    return;
                  }
                  const message =
                    result.code === 'PRODUCT_UNAVAILABLE'
                      ? t('training.packages.errUnavailable')
                      : result.code === 'ALREADY_SUBSCRIBED'
                        ? t('training.packages.errAlreadySubscribed')
                        : result.code === 'FORBIDDEN'
                          ? t('training.packages.errNoMembership')
                          : t('training.packages.errGeneric');
                  toast.error(message);
                })
                .finally(() => setBuyingId(null));
            },
          },
        ],
      );
    },
    [packages, t, toast],
  );

  const packageList = useMemo(() => packages.data ?? [], [packages.data]);
  const upcoming = useMemo(() => bookings.data ?? [], [bookings.data]);

  const refreshing =
    (packages.isFetching && !packages.isLoading) || (bookings.isFetching && !bookings.isLoading);
  const refetch = (): void => {
    void packages.refetch();
    void bookings.refetch();
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={colors.textMuted} />
      }
    >
      <Stack.Screen options={{ title: t('training.title') }} />

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
          {t('training.title')}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('training.subtitle')}</Text>
      </View>

      <Section title={t('training.packages.heading')} colors={colors}>
        {packages.isLoading ? (
          <Loading label={t('training.packages.loading')} colors={colors} />
        ) : packages.isError ? (
          <ErrorState
            message={t('training.packages.error')}
            retryLabel={t('training.retry')}
            onRetry={() => void packages.refetch()}
            colors={colors}
          />
        ) : packageList.length === 0 ? (
          <Empty
            title={t('training.packages.empty.title')}
            subtitle={t('training.packages.empty.subtitle')}
            colors={colors}
          />
        ) : (
          <View style={{ gap: 12 }}>
            {packageList.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onBuy={onBuy}
                busy={buyingId === pkg.id}
                disabled={buyingId !== null && buyingId !== pkg.id}
              />
            ))}
          </View>
        )}
      </Section>

      <Section title={t('training.sessions.heading')} colors={colors}>
        {bookings.isLoading ? (
          <Loading label={t('training.sessions.loading')} colors={colors} />
        ) : bookings.isError ? (
          <ErrorState
            message={t('training.sessions.error')}
            retryLabel={t('training.retry')}
            onRetry={() => void bookings.refetch()}
            colors={colors}
          />
        ) : upcoming.length === 0 ? (
          <Empty
            title={t('training.sessions.empty.title')}
            subtitle={t('training.sessions.empty.subtitle')}
            actionLabel={t('training.sessions.empty.action')}
            onAction={() => router.push('/classes')}
            colors={colors}
          />
        ) : (
          <View style={{ gap: 8 }}>
            {upcoming.map((entry) => (
              <BookingCard
                key={entry.bookingId}
                entry={entry}
                onPress={(instanceId) => router.push(`/classes/${instanceId}`)}
              />
            ))}
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

interface Colors {
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
}

/** One titled section with its heading and body. */
function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: Colors;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

/** A centered spinner + label, shared by both sections. */
function Loading({ label, colors }: { label: string; colors: Colors }) {
  return (
    <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={{ fontSize: 14, color: colors.textMuted }}>{label}</Text>
    </View>
  );
}

/** A retryable error state, shared by both sections. */
function ErrorState({
  message,
  retryLabel,
  onRetry,
  colors,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  colors: Colors;
}) {
  return (
    <View style={{ paddingVertical: 32, alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{retryLabel}</Text>
      </Pressable>
    </View>
  );
}

/** An empty state with an optional call-to-action, shared by both sections. */
function Empty({
  title,
  subtitle,
  actionLabel,
  onAction,
  colors,
}: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  colors: Colors;
}) {
  return (
    <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{title}</Text>
      <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 320 }}>
        {subtitle}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={{
            marginTop: 8,
            borderRadius: 10,
            backgroundColor: colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onPrimary }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
