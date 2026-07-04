import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { localeNames, type Locale } from '@fit/i18n';
import type { MeSubscription, MeSubscriptionStatus } from '@fit/types';
import { useI18n, useToast } from '../../../providers';
import { useAuth } from '../../../hooks/useAuth';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useMeProfile } from '../../../hooks/useMeProfile';
import { useMeSubscription } from '../../../hooks/useMeSubscription';
import { useMyCreditPacks } from '../../../hooks/useMyCreditPacks';
import { useMemberBookings } from '../../../hooks/useMemberBookings';
import { useNotificationPrefs } from '../../../hooks/useNotificationPrefs';
import { useSubscriptionActions } from '../../../hooks/useSubscriptionActions';
import { totalRemainingCredits } from '../../../lib/credit-packs';

// Formacore "Aurora Glass" member Profile & Membership (member-profile-mobile
// artboard, T7.9) — the member's account hub: a profile header, the membership
// card with a wired freeze/resume flow, PT credits, training stats, achievements,
// notification toggles and a settings list, over the same near-black `ink-950`
// canvas the rest of the redesigned member app uses (dark-only, like Home and
// the QR pass: the mobile artboards are a single frosted-aurora identity, so this
// does not track the system light/dark theme). React Native `className` can't
// paint CSS gradients or backdrop blur, so the membership card's gradient is
// approximated with a solid brand fill + translucent overlays — the same trick
// Home and the QR pass use.
//
// Everything with real backing is LIVE, wired to the member-facing API:
//   • name + email               ← `GET /me/profile`
//   • plan, status, days-left,   ← `GET /me/subscription`
//     renewal date, freeze allowance
//   • PT sessions left           ← `GET /members/me/credit-packs`
//   • training stats / badges    ← `GET /me/bookings` (attended)
//   • notification toggles       ← local `notification-prefs` (AsyncStorage)
// The freeze sheet posts to `POST /subscriptions/:id/freeze` and the frozen-card
// "Resume now" to `.../unfreeze` — the same member endpoints the web portal's
// freeze card uses. Actions with no mobile backing (payment methods, profile
// editing) are intentionally not surfaced; the menu links only to real screens.

const DAY_MS = 86_400_000;

/** Subscription states that grant access — a green "Active"/"Trial" pass. */
const LIVE_STATUSES = new Set<MeSubscriptionStatus>(['ACTIVE', 'TRIAL']);
/** States a member may freeze from — mirrors the API's freeze state machine. */
const FREEZABLE = new Set<MeSubscriptionStatus>(['ACTIVE', 'TRIAL']);

/** Whole days between now and an ISO instant, floored at 0. */
function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS));
}

/** Whole days in a billing period (period end − start), floored at 0. */
function periodDays(sub: MeSubscription): number {
  return Math.max(
    0,
    Math.round(
      (new Date(sub.currentPeriodEnd).getTime() - new Date(sub.currentPeriodStart).getTime()) /
        DAY_MS,
    ),
  );
}

/** Fraction (0–1) of the current billing period elapsed, for the pass meter. */
function periodProgress(sub: MeSubscription): number {
  const start = new Date(sub.currentPeriodStart).getTime();
  const end = new Date(sub.currentPeriodEnd).getTime();
  if (!(end > start)) return 0;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

/** Status pill colours — success dot when live, warning when paused/overdue. */
function statusTone(status: MeSubscriptionStatus | null): { dot: string; live: boolean } {
  if (status && LIVE_STATUSES.has(status)) return { dot: 'bg-success-300', live: true };
  if (status === 'FROZEN' || status === 'PAST_DUE') return { dot: 'bg-warning-300', live: false };
  return { dot: 'bg-white/60', live: false };
}

/** A frosted glass surface — the profile's card primitive (dark-only). */
function GlassCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={`overflow-hidden rounded-card border border-white/10 bg-white/5 ${className}`}>
      {children}
    </View>
  );
}

/** A design-system switch: a pill track with a sliding white knob. */
function Toggle({
  on,
  onToggle,
  disabled = false,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onToggle}
      className={`h-6 w-11 justify-center rounded-pill px-0.5 ${
        on ? 'bg-brand-500' : 'border border-white/15 bg-white/10'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <View className={`h-5 w-5 rounded-full bg-white ${on ? 'self-end' : 'self-start'}`} />
    </Pressable>
  );
}

/** Icon-tile tone → static NativeWind classes (must be literal for extraction). */
const TILE_TONES: Record<string, string> = {
  brand: 'bg-brand-500/15',
  accent: 'bg-accent-500/15',
  iris: 'bg-iris-500/15',
  success: 'bg-success-500/15',
  warning: 'bg-warning-500/15',
  flame: 'bg-flame-500/15',
  info: 'bg-info-500/15',
};

/** One nav row in the settings menu: an emoji tile, label + hint, a chevron. */
function MenuRow({
  glyph,
  tone,
  label,
  hint,
  onPress,
  first = false,
}: {
  glyph: string;
  tone: keyof typeof TILE_TONES;
  label: string;
  hint?: string;
  onPress?: () => void;
  first?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-white/5 ${
        first ? '' : 'border-t border-white/[0.06]'
      }`}
    >
      <View className={`h-9 w-9 items-center justify-center rounded-btn ${TILE_TONES[tone]}`}>
        <Text className="text-base">{glyph}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-white">{label}</Text>
        {hint ? (
          <Text className="text-xs text-ink-400" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Text className="text-ink-600">›</Text>
    </Pressable>
  );
}

/** The canonical freeze presets (whole days), longest first. */
const FREEZE_PRESETS = [
  { days: 60, key: 'opt2m' },
  { days: 30, key: 'opt1m' },
  { days: 14, key: 'opt2w' },
] as const;

export default function ProfileScreen() {
  const { t, locale, locales, setLocale } = useI18n();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { logout } = useAuth();

  const gymId = useActiveGymId();
  const profileQuery = useMeProfile();
  const subscriptionQuery = useMeSubscription();
  const creditsQuery = useMyCreditPacks();
  const bookingsQuery = useMemberBookings(gymId, 'all');
  const { prefs, toggle } = useNotificationPrefs();

  const subscription = subscriptionQuery.data ?? null;
  const { freeze, resume } = useSubscriptionActions(subscription?.id ?? null);

  const [signingOut, setSigningOut] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number | null>(null);

  // ---- identity ----
  const name = profileQuery.data?.name?.trim() || t('member.home.greetingFallbackName');
  const email = profileQuery.data?.email?.trim() ?? '';
  const initial = name.slice(0, 1).toUpperCase();

  // ---- membership ----
  const status = subscription?.status ?? null;
  const tone = statusTone(status);
  const statusLabel = status
    ? t(`member.membership.status.${status}`)
    : t('member.membership.noPlan');
  const planLabel = subscription?.planName ?? statusLabel;
  const isFrozen = status === 'FROZEN';
  const canFreeze =
    subscription != null &&
    status != null &&
    FREEZABLE.has(status) &&
    subscription.freezeDaysPerPeriod > 0 &&
    subscription.freezeDaysRemaining > 0;

  const daysLeft = subscription ? daysUntil(subscription.currentPeriodEnd) : 0;
  const totalDays = subscription ? periodDays(subscription) : 0;
  const progressPct = subscription ? Math.round(periodProgress(subscription) * 100) : 0;
  const renewsDate = subscription
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      })
    : '';
  const frozenUntilDate = subscription?.frozenUntil
    ? new Date(subscription.frozenUntil).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      })
    : '';
  const memberYear = subscription ? new Date(subscription.memberSince).getFullYear() : null;
  const tierName = subscription?.planName ?? t('member.profile.mobile.member');

  // ---- PT credits ----
  const credits = totalRemainingCredits(creditsQuery.data ?? []);
  const creditsLabel =
    credits === 0
      ? t('member.profile.mobile.pt.none')
      : credits === 1
        ? t('member.profile.mobile.pt.sessionsLeftOne', { count: credits })
        : t('member.profile.mobile.pt.sessionsLeftOther', { count: credits });

  // ---- stats (from attended bookings, mirroring Home) ----
  const bookings = bookingsQuery.data ?? [];
  const attended = useMemo(
    () => bookings.filter((b) => b.status === 'ATTENDED').length,
    [bookings],
  );
  const upcomingCount = useMemo(
    () => bookings.filter((b) => b.status === 'BOOKED' || b.status === 'WAITLIST').length,
    [bookings],
  );
  const stats = [
    {
      key: 'streak',
      glyph: '🔥',
      value: Math.min(attended, 30),
      label: t('member.profile.mobile.stats.dayStreak'),
    },
    {
      key: 'visits',
      glyph: '✅',
      value: attended,
      label: t('member.profile.mobile.stats.totalVisits'),
    },
    {
      key: 'classes',
      glyph: '📅',
      value: upcomingCount,
      label: t('member.profile.mobile.stats.classes'),
    },
  ];

  // ---- achievements (derived from real attendance, honest got/locked) ----
  const badges = [
    {
      key: 'first',
      glyph: '⚡',
      label: t('member.profile.mobile.achievements.firstClass'),
      got: attended >= 1,
      cls: 'bg-warning-500/10 border-warning-400/25',
    },
    {
      key: 'ten',
      glyph: '🎯',
      label: t('member.profile.mobile.achievements.tenVisits'),
      got: attended >= 10,
      cls: 'bg-brand-500/10 border-brand-400/25',
    },
    {
      key: 'fifty',
      glyph: '🏅',
      label: t('member.profile.mobile.achievements.fiftyVisits'),
      got: attended >= 50,
      cls: 'bg-iris-500/10 border-iris-400/25',
    },
    {
      key: 'hundred',
      glyph: '🏆',
      label: t('member.profile.mobile.achievements.hundredVisits'),
      got: attended >= 100,
      cls: 'bg-flame-500/10 border-flame-400/25',
    },
  ];

  const version = Constants.expoConfig?.version ?? '—';

  // Presets offered in the sheet: the canonical ones that fit the remaining
  // allowance, plus the exact remaining balance if none of them do (so a member
  // with e.g. 9 days left can still freeze those 9). Longest first, selectable.
  const presets = useMemo(() => {
    const remaining = subscription?.freezeDaysRemaining ?? 0;
    const fitting = FREEZE_PRESETS.filter((p) => p.days <= remaining).map((p) => ({
      days: p.days,
      label: t(`member.profile.mobile.freezeSheet.${p.key}`),
    }));
    if (fitting.length === 0 && remaining > 0) {
      return [
        {
          days: remaining,
          label: t('member.profile.mobile.freezeSheet.optDays', { days: remaining }),
        },
      ];
    }
    return fitting;
  }, [subscription?.freezeDaysRemaining, t]);

  const openFreezeSheet = (): void => {
    setSelectedDays(presets[0]?.days ?? null);
    setSheetOpen(true);
  };

  const confirmFreeze = (): void => {
    if (selectedDays == null) return;
    void freeze
      .mutateAsync({ startDate: new Date().toISOString(), durationDays: selectedDays })
      .then((result) => {
        if (result.ok) {
          setSheetOpen(false);
          const date = new Date(result.data.frozenUntil).toLocaleDateString(locale, {
            day: 'numeric',
            month: 'short',
          });
          toast.success(t('member.membership.freeze.frozenToast', { date }));
        } else if (result.code === 'EXCEEDS_FREEZE_ALLOWANCE') {
          toast.error(
            t('member.membership.freeze.errAllowance', {
              days: result.remainingDays ?? subscription?.freezeDaysRemaining ?? 0,
            }),
          );
        } else {
          toast.error(t('member.membership.freeze.errGeneric'));
        }
      })
      .catch(() => toast.error(t('member.membership.freeze.errGeneric')));
  };

  const confirmResume = (): void => {
    void resume
      .mutateAsync()
      .then((result) => {
        if (result.ok) {
          toast.success(t('member.membership.freeze.resumedToast'));
        } else {
          toast.error(t('member.membership.freeze.errGeneric'));
        }
      })
      .catch(() => toast.error(t('member.membership.freeze.errGeneric')));
  };

  const performSignOut = (): void => {
    setSigningOut(true);
    void logout()
      .catch(() => undefined)
      .finally(() => toast.success(t('settings.about.signedOut')));
  };

  const confirmSignOut = (): void => {
    Alert.alert(t('settings.about.signOut'), t('settings.about.signOutConfirm'), [
      { text: t('settings.about.signOutCancel'), style: 'cancel' },
      { text: t('settings.about.signOut'), style: 'destructive', onPress: performSignOut },
    ]);
  };

  const selectedLabel = presets.find((p) => p.days === selectedDays)?.label ?? '';

  return (
    <View className="flex-1 bg-ink-950">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* aurora wash — approximated with soft translucent blobs */}
        <View pointerEvents="none" className="absolute inset-x-0 top-0 h-[520px] overflow-hidden">
          <View className="absolute -top-24 left-1/2 -ml-52 h-[420px] w-[420px] rounded-full bg-brand-500/20" />
          <View className="absolute right-[-96px] top-56 h-80 w-80 rounded-full bg-iris-600/15" />
        </View>

        {/* ---- top app bar ---- */}
        <View className="flex-row items-center justify-between px-5">
          <View className="w-11" />
          <Text className="text-lg font-extrabold tracking-tight text-white">
            {t('member.profile.mobile.title')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('member.profile.mobile.notificationsA11y')}
            onPress={() => router.push('/profile/notifications')}
            className="h-11 w-11 items-center justify-center rounded-btn border border-white/10 bg-white/5 active:bg-white/10"
          >
            <Text className="text-lg">🔔</Text>
          </Pressable>
        </View>

        <View className="gap-5 px-5">
          {/* ---- profile header ---- */}
          <View className="items-center pt-1">
            <View className="relative">
              <View className="h-24 w-24 items-center justify-center rounded-full border-2 border-brand-500 bg-brand-600">
                <Text className="text-3xl font-black text-white">{initial}</Text>
              </View>
              <View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-2 border-ink-950 bg-brand-500">
                <Text className="text-xs">⚡</Text>
              </View>
            </View>
            <Text className="mt-3.5 text-2xl font-extrabold tracking-tight text-white">{name}</Text>
            {email ? <Text className="text-sm text-ink-400">{email}</Text> : null}
            {memberYear ? (
              <View className="mt-2.5 flex-row items-center gap-1.5 rounded-pill border border-brand-400/30 bg-brand-500/15 px-3 py-1">
                <Text className="text-xs">🎟️</Text>
                <Text className="text-xs font-semibold text-brand-200">
                  {t('member.profile.mobile.memberSince', { tier: tierName, year: memberYear })}
                </Text>
              </View>
            ) : null}
          </View>

          {/* ---- membership card ---- */}
          <View className="overflow-hidden rounded-card border border-white/15 bg-brand-600 p-5">
            <View className="absolute inset-x-0 top-0 h-px bg-white/40" />
            <View className="absolute -right-8 -top-10 h-44 w-44 rounded-full bg-white/10" />
            <View className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-iris-400/20" />

            <View className="flex-row items-center justify-between">
              <Text className="text-[10px] font-bold uppercase tracking-[2px] text-white/70">
                {t('member.profile.mobile.membership')}
              </Text>
              <View className="flex-row items-center gap-1.5 rounded-pill border border-white/30 bg-white/20 px-2 py-0.5">
                <View className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                <Text className="text-[10px] font-bold text-white">{statusLabel}</Text>
              </View>
            </View>

            <Text className="mt-3 text-3xl font-black tracking-tight text-white" numberOfLines={1}>
              {planLabel}
            </Text>

            {subscription ? (
              <View className="mt-4">
                <View className="mb-1.5 flex-row items-end justify-between">
                  <Text className="text-xs font-semibold text-white/80">
                    {isFrozen && frozenUntilDate
                      ? t('member.profile.mobile.frozenUntil', { date: frozenUntilDate })
                      : t('member.profile.mobile.daysLeft', { used: daysLeft, total: totalDays })}
                  </Text>
                  {!isFrozen ? (
                    <Text className="font-mono text-[11px] text-white/70">
                      {t('member.profile.mobile.renews', { date: renewsDate })}
                    </Text>
                  ) : null}
                </View>
                <View className="h-2 overflow-hidden rounded-pill bg-white/20">
                  <View
                    className="h-full rounded-pill bg-white"
                    style={{ width: `${progressPct}%` }}
                  />
                </View>
              </View>
            ) : (
              <Text className="mt-2 text-sm text-white/80">
                {t('member.profile.mobile.noPlanHint')}
              </Text>
            )}

            {/* action row — every button is real */}
            <View className="mt-5 flex-row items-center gap-2.5">
              {!subscription ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/profile/training')}
                  className="h-11 flex-1 items-center justify-center rounded-btn bg-white active:bg-ink-100"
                >
                  <Text className="text-sm font-bold text-brand-700">
                    {t('member.profile.mobile.browsePlans')}
                  </Text>
                </Pressable>
              ) : isFrozen ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={resume.isPending}
                  onPress={confirmResume}
                  className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-btn bg-white active:bg-ink-100"
                >
                  {resume.isPending ? (
                    <ActivityIndicator color="#5044D2" size="small" />
                  ) : (
                    <Text className="text-sm font-bold text-brand-700">
                      {t('member.profile.mobile.resumeNow')}
                    </Text>
                  )}
                </Pressable>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/qr')}
                    className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-btn bg-white active:bg-ink-100"
                  >
                    <Text className="text-sm">▦</Text>
                    <Text className="text-sm font-bold text-brand-700">
                      {t('member.profile.mobile.showQr')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canFreeze}
                    onPress={openFreezeSheet}
                    className={`h-11 flex-row items-center justify-center gap-2 rounded-btn border border-white/30 bg-white/15 px-4 active:bg-white/25 ${
                      canFreeze ? '' : 'opacity-40'
                    }`}
                  >
                    <Text className="text-sm">❄️</Text>
                    <Text className="text-sm font-semibold text-white">
                      {t('member.profile.mobile.freeze')}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          {/* ---- PT credits ---- */}
          <GlassCard className="flex-row items-center gap-3.5 p-4">
            <View className="h-12 w-12 items-center justify-center rounded-card border border-success-400/25 bg-success-500/15">
              <Text className="text-xl">🎫</Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-extrabold leading-tight text-white">
                {creditsLabel}
              </Text>
              <Text className="text-xs text-ink-400">
                {credits > 0
                  ? t('member.profile.mobile.pt.refreshesActive')
                  : t('member.profile.mobile.pt.refreshesEmpty')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/profile/training')}
              className="h-9 justify-center rounded-btn border border-white/15 bg-white/[0.07] px-3.5 active:bg-white/[0.12]"
            >
              <Text className="text-xs font-semibold text-white">
                {t('member.profile.mobile.pt.buy')}
              </Text>
            </Pressable>
          </GlassCard>

          {/* ---- stats ---- */}
          <View className="flex-row gap-3">
            {stats.map((s) => (
              <GlassCard key={s.key} className="flex-1 p-3.5">
                <Text className="text-base">{s.glyph}</Text>
                <Text
                  className="mt-2.5 text-2xl font-extrabold text-white"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {s.value}
                </Text>
                <Text className="mt-0.5 text-[10px] font-semibold uppercase tracking-[1px] text-ink-400">
                  {s.label}
                </Text>
              </GlassCard>
            ))}
          </View>

          {/* ---- achievements ---- */}
          <View>
            <Text className="mb-3 text-lg font-bold tracking-tight text-white">
              {t('member.profile.mobile.achievements.title')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
            >
              {badges.map((b) => (
                <View
                  key={b.key}
                  className={`w-24 items-center rounded-card border p-3 ${
                    b.got ? b.cls : 'border-white/[0.06] bg-white/[0.02] opacity-50'
                  }`}
                >
                  <View
                    className={`h-11 w-11 items-center justify-center rounded-full ${
                      b.got ? 'bg-white/10' : 'bg-white/[0.05]'
                    }`}
                  >
                    <Text className="text-lg">{b.glyph}</Text>
                  </View>
                  <Text
                    className="mt-2 text-center text-[11px] font-semibold text-white"
                    numberOfLines={2}
                  >
                    {b.label}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* ---- quick toggles ---- */}
          <GlassCard>
            <View className="flex-row items-center gap-3 px-4 py-3.5">
              <View className="h-9 w-9 items-center justify-center rounded-btn bg-warning-500/15">
                <Text className="text-base">🔔</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-white">
                  {t('member.profile.mobile.toggles.push')}
                </Text>
                <Text className="text-xs text-ink-400">
                  {t('member.profile.mobile.toggles.pushHint')}
                </Text>
              </View>
              <Toggle
                on={prefs.push}
                onToggle={() => void toggle('push')}
                label={t('member.profile.mobile.toggles.push')}
              />
            </View>
            <View className="flex-row items-center gap-3 border-t border-white/[0.06] px-4 py-3.5">
              <View className="h-9 w-9 items-center justify-center rounded-btn bg-accent-500/15">
                <Text className="text-base">⏰</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-white">
                  {t('member.profile.mobile.toggles.reminders')}
                </Text>
                <Text className="text-xs text-ink-400">
                  {t('member.profile.mobile.toggles.remindersHint')}
                </Text>
              </View>
              <Toggle
                on={prefs.push && prefs.classReminders}
                disabled={!prefs.push}
                onToggle={() => void toggle('classReminders')}
                label={t('member.profile.mobile.toggles.reminders')}
              />
            </View>
          </GlassCard>

          {/* ---- language ---- */}
          <View>
            <Text className="mb-2 text-[11px] font-bold uppercase tracking-[1px] text-ink-400">
              {t('member.profile.mobile.menu.language')}
            </Text>
            <View className="flex-row gap-2 rounded-card border border-white/10 bg-white/5 p-1">
              {locales.map((option: Locale) => {
                const active = option === locale;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setLocale(option)}
                    className={`flex-1 items-center justify-center rounded-btn py-2.5 ${
                      active ? 'bg-white' : 'active:bg-white/10'
                    }`}
                  >
                    <Text
                      className={`text-[15px] font-semibold ${active ? 'text-ink-950' : 'text-ink-300'}`}
                    >
                      {localeNames[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ---- settings menu ---- */}
          <GlassCard>
            <MenuRow
              first
              glyph="🔔"
              tone="brand"
              label={t('member.profile.mobile.menu.notifications')}
              hint={t('member.profile.mobile.menu.notificationsHint')}
              onPress={() => router.push('/profile/notifications')}
            />
            <MenuRow
              glyph="🏋️"
              tone="iris"
              label={t('member.profile.mobile.menu.training')}
              hint={t('member.profile.mobile.menu.trainingHint')}
              onPress={() => router.push('/profile/training')}
            />
            <MenuRow
              glyph="🧑‍🏫"
              tone="accent"
              label={t('member.profile.mobile.menu.trainers')}
              hint={t('member.profile.mobile.menu.trainersHint')}
              onPress={() => router.push('/trainers')}
            />
            <View className="flex-row items-center gap-3 border-t border-white/[0.06] px-4 py-3.5">
              <View className="h-9 w-9 items-center justify-center rounded-btn bg-info-500/15">
                <Text className="text-base">🌗</Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-white">
                  {t('member.profile.mobile.menu.appearance')}
                </Text>
                <Text className="text-xs text-ink-400">
                  {t('member.profile.mobile.menu.appearanceHint')}
                </Text>
              </View>
            </View>
          </GlassCard>

          {/* ---- sign out ---- */}
          <Pressable
            accessibilityRole="button"
            disabled={signingOut}
            onPress={confirmSignOut}
            className="h-12 flex-row items-center justify-center gap-2 rounded-btn border border-danger-400/20 bg-danger-500/10 active:bg-danger-500/20"
            style={{ opacity: signingOut ? 0.6 : 1 }}
          >
            <Text className="text-base">↩︎</Text>
            <Text className="text-[15px] font-semibold text-danger-300">
              {t('settings.about.signOut')}
            </Text>
          </Pressable>

          <Text className="pb-1 text-center font-mono text-[11px] text-ink-600">
            {t('member.profile.mobile.version', { version })}
          </Text>
        </View>
      </ScrollView>

      {/* ---- freeze membership bottom sheet (wired) ---- */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <View className="flex-1 justify-end">
          <Pressable
            accessibilityLabel={t('member.membership.freeze.cancel')}
            onPress={() => setSheetOpen(false)}
            className="absolute inset-0 bg-ink-950/75"
          />
          <View
            className="rounded-t-[28px] border border-white/10 bg-ink-900 px-6 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
          >
            <View className="items-center pt-1">
              <View className="h-1 w-10 rounded-full bg-white/20" />
            </View>
            <View className="mt-4 flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-xl font-extrabold tracking-tight text-white">
                  {t('member.profile.mobile.freezeSheet.title')}
                </Text>
                <Text className="mt-1 text-sm text-ink-400">
                  {t('member.profile.mobile.freezeSheet.subtitle')}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('member.membership.freeze.cancel')}
                onPress={() => setSheetOpen(false)}
                className="h-9 w-9 items-center justify-center rounded-btn active:bg-white/10"
              >
                <Text className="text-lg text-ink-400">✕</Text>
              </Pressable>
            </View>

            <View className="mt-4 flex-row gap-2.5">
              {presets.map((preset) => {
                const active = preset.days === selectedDays;
                return (
                  <Pressable
                    key={preset.days}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedDays(preset.days)}
                    className={`flex-1 items-center rounded-card border p-3 ${
                      active
                        ? 'border-brand-400/40 bg-brand-500/15'
                        : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    <Text className="text-base font-extrabold text-white">{preset.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="mt-4 text-xs text-ink-400">
              {t('member.profile.mobile.freezeSheet.carryover', {
                days: subscription?.freezeDaysRemaining ?? 0,
              })}
            </Text>

            <View className="mt-5 flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                disabled={freeze.isPending}
                onPress={() => setSheetOpen(false)}
                className="h-12 flex-1 items-center justify-center rounded-btn border border-white/15 bg-white/[0.07] active:bg-white/[0.12]"
              >
                <Text className="text-sm font-semibold text-white">
                  {t('member.membership.freeze.cancel')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={freeze.isPending || selectedDays == null}
                onPress={confirmFreeze}
                className="h-12 items-center justify-center rounded-btn bg-brand-600 active:bg-brand-700"
                style={{ flex: 1.4, opacity: freeze.isPending || selectedDays == null ? 0.6 : 1 }}
              >
                {freeze.isPending ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text className="text-sm font-bold text-white">
                    {t('member.profile.mobile.freezeSheet.confirm', { label: selectedLabel })}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
