import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MeSubscription, MeSubscriptionStatus } from '@fit/types';
import { useI18n } from '../../providers';
import { useAuth } from '../../hooks/useAuth';
import { useActiveGymId } from '../../hooks/useActiveGym';
import { useSessionProfile } from '../../hooks/useSessionProfile';
import { useMeSubscription } from '../../hooks/useMeSubscription';
import { useMeProfile } from '../../hooks/useMeProfile';
import { useMemberBookings } from '../../hooks/useMemberBookings';
import { buildCheckInPayload } from '../../lib/checkin';
import { QrCode } from '../../components/qr/QrCode';

// Formacore "Aurora Glass" member QR check-in (member-checkin-mobile artboard,
// T7.8) — the full-screen pass a member holds up at the front desk. A glowing
// membership pass with a large live-refreshing QR, a brightness boost, and the
// member's recent gym visits, over the same near-black `ink-950` canvas the rest
// of the redesigned member app uses (dark-only, like Home and the auth screens:
// the mobile artboards are a single frosted-aurora identity, so this does not
// track the system light/dark theme). React Native `className` can't paint CSS
// gradients or backdrop blur, so the pass's gradient is approximated with a solid
// brand fill + translucent white overlays — the same trick Home uses.
//
// Everything on the pass is LIVE, wired to the member-facing API:
//   • membership status, plan, and days-left  ← `GET /me/subscription`
//   • the member's display name                ← `GET /me/profile`
//   • recent check-ins                         ← `GET /me/bookings` (attended)
// The QR itself encodes the member's check-in identity (member id + active gym),
// which the reception desk's scanner resolves and records through the check-in
// backend (`POST /admin/check-ins`, T2.8). There is no member-scoped check-in
// *write* — the member only ever presents the code — so "recent check-ins" is
// drawn from the member's attended class bookings, the same attendance record the
// web portal treats as the member's visit history.
//
// The QR carries a freshness token that rotates every REFRESH_SECONDS, which the
// on-screen countdown pill reflects — so the painted code genuinely changes each
// window and a stale screenshot of the pass no longer matches the live one. The
// scanner ignores the token (it resolves member + gym), so rotation never breaks
// a real scan.

/** How long a painted code stays live before its freshness token rotates. */
const REFRESH_SECONDS = 60;

/** Subscription states that grant access — a green "Active" pass. */
const LIVE_STATUSES = new Set<MeSubscriptionStatus>(['ACTIVE', 'TRIAL']);

const DAY_MS = 86_400_000;

/** A short member code (`FC-XXXX`) from the user id, matching the Home pass. */
function memberCode(userId: string | null): string {
  return `FC-${(userId ?? 'member').slice(-4).toUpperCase()}`;
}

/** `M:SS` for the refresh countdown pill. */
function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Whole days between now and an ISO instant, floored at 0 (0 once it passes). */
function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS));
}

/** Fraction (0–1) of the current billing period elapsed, for the pass meter. */
function periodProgress(sub: MeSubscription): number {
  const start = new Date(sub.currentPeriodStart).getTime();
  const end = new Date(sub.currentPeriodEnd).getTime();
  if (!(end > start)) return 0;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

/** A friendly day label (Today / Yesterday / weekday+date) for a past visit. */
function visitDay(iso: string, locale: string, today: string, yesterday: string): string {
  const target = new Date(iso);
  const dayDiff = Math.round(
    (new Date(new Date().toDateString()).getTime() - new Date(target.toDateString()).getTime()) /
      DAY_MS,
  );
  if (dayDiff <= 0) return today;
  if (dayDiff === 1) return yesterday;
  return target.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function QrScreen() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { isLoading: sessionLoading } = useAuth();
  const { userId, gymId } = useSessionProfile();
  const activeGymId = useActiveGymId();

  const subscriptionQuery = useMeSubscription();
  const profileQuery = useMeProfile();
  const bookingsQuery = useMemberBookings(activeGymId, 'all');

  // Brightness boost — a visual lift (a brighter frame around the pass) rather
  // than a real backlight change: the app ships no `expo-brightness` native
  // module, and the artboard's boost is itself just a ring on the code, so this
  // matches the design without pulling a module EAS would have to rebuild.
  const [boosted, setBoosted] = useState(false);

  // One ticking counter drives both the countdown and the freshness token: the
  // seconds left are `REFRESH_SECONDS − (tick mod REFRESH_SECONDS)` and the code
  // rotates each time that wraps (a new `cycle`). Deriving both from one counter
  // keeps them exactly in step.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const secondsLeft = REFRESH_SECONDS - (tick % REFRESH_SECONDS);
  const cycle = Math.floor(tick / REFRESH_SECONDS);

  const payload = useMemo(
    () => (userId ? buildCheckInPayload({ userId, gymId, nonce: cycle }) : null),
    [userId, gymId, cycle],
  );

  const subscription = subscriptionQuery.data ?? null;
  const memberName = profileQuery.data?.name?.trim() || t('member.home.greetingFallbackName');
  const code = memberCode(userId);

  // Status pill: an active/trial plan is "Active" (green); anything else falls
  // back to the shared membership-status label, or "No active plan" when the
  // member has never subscribed.
  const status = subscription?.status ?? null;
  const isLive = status != null && LIVE_STATUSES.has(status);
  const statusLabel = status
    ? t(`member.membership.status.${status}`)
    : t('member.membership.noPlan');
  const planLabel = subscription?.planName ?? statusLabel;

  const daysLeft = subscription ? daysUntil(subscription.currentPeriodEnd) : null;
  const progressPct = subscription ? Math.round(periodProgress(subscription) * 100) : 0;

  // Recent check-ins ← attended bookings, newest first (the member's real visit
  // record; see the header comment on why this stands in for gym-entry check-ins).
  const recentVisits = useMemo(() => {
    const bookings = bookingsQuery.data ?? [];
    return bookings
      .filter((b) => b.status === 'ATTENDED')
      .sort(
        (a, b) =>
          new Date(b.classInstance.startsAt).getTime() -
          new Date(a.classInstance.startsAt).getTime(),
      )
      .slice(0, 5);
  }, [bookingsQuery.data]);

  const today = t('member.home.today');
  const yesterday = t('qr.yesterday');

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* aurora wash — approximated with soft translucent blobs */}
      <View pointerEvents="none" className="absolute inset-x-0 top-0 h-[520px] overflow-hidden">
        <View className="absolute -top-24 left-1/2 -ml-52 h-[420px] w-[420px] rounded-full bg-brand-500/20" />
        <View className="absolute right-[-80px] top-40 h-80 w-80 rounded-full bg-iris-600/15" />
      </View>

      {/* ---- top app bar ---- */}
      <View className="flex-row items-center justify-between px-5">
        <View className="w-11" />
        <Text className="text-lg font-extrabold tracking-tight text-white">{t('qr.title')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: boosted }}
          accessibilityLabel={t('qr.boost')}
          onPress={() => setBoosted((b) => !b)}
          className={`h-11 w-11 items-center justify-center rounded-btn border ${
            boosted
              ? 'border-warning-400/30 bg-warning-500/20'
              : 'border-white/10 bg-white/5 active:bg-white/10'
          }`}
        >
          <Text className="text-lg">☀️</Text>
        </Pressable>
      </View>

      <View className="px-5">
        <Text className="mt-2 text-center text-sm text-ink-400">{t('qr.subtitle')}</Text>

        {sessionLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator color="#9184F1" />
          </View>
        ) : payload ? (
          <>
            {/* ============ membership pass ============ */}
            <View className="mt-5 overflow-hidden rounded-card border border-white/15 bg-brand-600 p-5">
              {/* Faked gradient: translucent overlays over the solid brand fill. */}
              <View className="absolute inset-x-0 top-0 h-px bg-white/40" />
              <View className="absolute -right-8 -top-10 h-44 w-44 rounded-full bg-white/10" />
              <View className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-iris-400/20" />

              {/* header: brand + status */}
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Text className="text-base">⚡</Text>
                  <Text className="text-sm font-extrabold tracking-tight text-white">
                    {t('member.shell.brand')}
                  </Text>
                </View>
                <View
                  className={`flex-row items-center gap-1.5 rounded-pill border px-2 py-0.5 ${
                    isLive ? 'border-white/30 bg-white/20' : 'border-white/20 bg-white/10'
                  }`}
                >
                  <View
                    className={`h-1.5 w-1.5 rounded-full ${
                      isLive ? 'bg-success-300' : 'bg-white/60'
                    }`}
                  />
                  <Text className="text-[10px] font-bold text-white">{statusLabel}</Text>
                </View>
              </View>

              {/* QR */}
              <View className="mt-5 items-center">
                <View
                  className={`rounded-[20px] bg-white p-4 ${
                    boosted ? 'border-4 border-white/70' : ''
                  }`}
                >
                  {subscriptionQuery.isLoading ? (
                    <View className="h-[236px] w-[236px] items-center justify-center">
                      <ActivityIndicator color="#5044D2" />
                    </View>
                  ) : (
                    <QrCode value={payload} size={236} />
                  )}
                </View>
              </View>

              {/* refresh countdown pill */}
              <View className="mt-4 items-center">
                <View className="flex-row items-center gap-2 rounded-pill border border-white/25 bg-white/15 px-3 py-1.5">
                  <Text className="text-xs">🔄</Text>
                  <Text className="font-mono text-xs text-white/90">
                    {t('qr.refreshesIn', { time: formatCountdown(secondsLeft) })}
                  </Text>
                </View>
              </View>

              {/* member line */}
              <View className="mt-5 flex-row items-center justify-between">
                <View className="min-w-0 flex-1 flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center rounded-full border-2 border-white/40 bg-white/15">
                    <Text className="text-base font-black text-white">
                      {memberName.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text
                      className="text-base font-extrabold leading-tight text-white"
                      numberOfLines={1}
                    >
                      {memberName}
                    </Text>
                    <Text className="mt-0.5 font-mono text-xs text-white/70" numberOfLines={1}>
                      {planLabel} · {t('qr.memberId')} {code}
                    </Text>
                  </View>
                </View>
                {daysLeft != null ? (
                  <View className="items-end pl-3">
                    <Text
                      className="text-xl font-black leading-none text-white"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {daysLeft}
                    </Text>
                    <Text className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                      {t('qr.daysLeft')}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* billing-period meter */}
              {subscription ? (
                <View className="mt-4 h-1.5 overflow-hidden rounded-pill bg-white/20">
                  <View
                    className="h-full rounded-pill bg-white"
                    style={{ width: `${progressPct}%` }}
                  />
                </View>
              ) : null}
            </View>

            {/* manual fallback: the member id, for a desk that types codes by hand */}
            <View className="mt-4 flex-row items-center justify-between rounded-card border border-white/10 bg-white/5 px-4 py-3">
              <Text className="text-[11px] font-semibold uppercase tracking-[1px] text-ink-400">
                {t('qr.memberId')}
              </Text>
              <Text
                className="font-mono text-sm text-white"
                style={{ fontVariant: ['tabular-nums'] }}
                numberOfLines={1}
              >
                {userId}
              </Text>
            </View>

            {/* ============ recent check-ins ============ */}
            <View className="mt-6">
              <Text className="mb-3 text-base font-bold tracking-tight text-white">
                {t('qr.recentTitle')}
              </Text>
              {bookingsQuery.isLoading ? (
                <View className="items-center py-8">
                  <ActivityIndicator color="#9184F1" />
                </View>
              ) : recentVisits.length > 0 ? (
                <View className="overflow-hidden rounded-card border border-white/10 bg-white/5">
                  {recentVisits.map((visit, i) => (
                    <View
                      key={visit.bookingId}
                      className={`flex-row items-center gap-3 px-4 py-3 ${
                        i > 0 ? 'border-t border-white/[0.06]' : ''
                      }`}
                    >
                      <View className="h-9 w-9 items-center justify-center rounded-btn bg-brand-500/15">
                        <Text className="text-sm">✅</Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                          {visit.classInstance.title}
                        </Text>
                        <Text className="text-[11px] text-ink-500">
                          {visitDay(visit.classInstance.startsAt, locale, today, yesterday)}
                        </Text>
                      </View>
                      <Text
                        className="font-mono text-xs text-ink-400"
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {new Date(visit.classInstance.startsAt).toLocaleTimeString(locale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View className="items-center gap-2 rounded-card border border-white/10 bg-white/5 py-8">
                  <Text className="text-2xl">✅</Text>
                  <Text className="text-sm text-ink-400">{t('qr.recentEmpty')}</Text>
                </View>
              )}
            </View>

            <Text className="mt-6 text-center text-[13px] text-ink-500">
              {t('qr.brightnessHint')}
            </Text>
          </>
        ) : (
          <View className="items-center py-24">
            <Text className="max-w-[280px] text-center text-sm text-ink-400">
              {t('qr.signedOut')}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
