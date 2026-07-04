import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { localeNames } from '@fit/i18n';
import type { MeSubscription, MemberBookingHistoryEntry } from '@fit/types';
import { useI18n, useToast } from '../../../providers';
import { useAuth } from '../../../hooks/useAuth';
import { useActiveGymId } from '../../../hooks/useActiveGym';
import { useMeProfile } from '../../../hooks/useMeProfile';
import { useMeSubscription } from '../../../hooks/useMeSubscription';
import { useMemberBookings } from '../../../hooks/useMemberBookings';
import { useNotificationPrefs } from '../../../hooks/useNotificationPrefs';
import {
  useFreezeSubscription,
  useUnfreezeSubscription,
} from '../../../hooks/useSubscriptionFreeze';

// Formacore "Aurora Glass" member profile hub (member-profile-mobile artboard) —
// the Profile tab's home, rebuilt from the T6.8 settings list to the redesign.
// A near-black `ink-950` canvas with the member's identity header, the digital
// membership card (with a wired freeze / resume flow), training stats derived
// from real bookings, milestone achievements, quick notification toggles, a
// settings menu, and sign out.
//
// Everything is wired to the SAME self-service queries the check-in pass reads —
// `/me/profile` for the name + email the session token never carries,
// `/me/subscription` for the live membership, and the member's bookings for the
// stat strip — so the hub mirrors real standing without a bespoke endpoint;
// sections with nothing to show degrade to a friendly state rather than a blank.
//
// Like the rest of the formacore mobile artboards (home T7.2, sign-in T7.1) this
// screen is intentionally dark-only: the mobile identity is a single frosted-
// aurora look, so it does not track the system light/dark theme the older themed
// tabs still do. React Native `className` can't paint CSS gradients or backdrop
// blur, so the membership card's gradient is approximated with a solid brand fill
// plus translucent white overlays — the same trick home and the auth screens use.

/** Statuses a member may freeze *from* — mirrors the API's freeze state machine. */
const FREEZABLE = new Set<MeSubscription['status']>(['ACTIVE', 'TRIAL']);

/**
 * The status-pill dot colour, as a COMPLETE Tailwind class literal. NativeWind
 * only emits classes it sees written out in full, so this returns whole strings
 * (`bg-success-300`) rather than a stem to interpolate — the same reason home's
 * `occupancyTone` returns full class names.
 */
function statusDotClass(status: MeSubscription['status']): string {
  switch (status) {
    case 'ACTIVE':
    case 'TRIAL':
      return 'bg-success-300';
    case 'FROZEN':
      return 'bg-accent-300';
    case 'PAST_DUE':
      return 'bg-warning-300';
    default:
      return 'bg-ink-300';
  }
}

/** A frosted glass surface — the hub's card primitive (dark-only). */
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

/** Whole days between now and an ISO instant, clamped at zero. */
function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Whole days spanned by an ISO period, at least one (guards a divide-by-zero). */
function periodDays(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

export default function ProfileScreen() {
  const { t, locale, locales, setLocale } = useI18n();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { logout } = useAuth();

  const gymId = useActiveGymId();
  const profileQuery = useMeProfile();
  const subscriptionQuery = useMeSubscription();
  const bookingsQuery = useMemberBookings(gymId, 'all');
  const { prefs, setPrefs, toggle } = useNotificationPrefs();
  const freezeMutation = useFreezeSubscription();
  const unfreezeMutation = useUnfreezeSubscription();

  const [signingOut, setSigningOut] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);

  const profile = profileQuery.data ?? null;
  const subscription = subscriptionQuery.data ?? null;

  // Identity — the display name / email come from `/me/profile`; a member whose
  // profile hasn't loaded (or has no name) falls back to the localized default.
  const memberName = profile?.name?.trim() || t('member.home.greetingFallbackName');
  const memberEmail = profile?.email ?? '';
  const initial = memberName.slice(0, 1).toUpperCase();

  // Training stats from the member's own bookings — the same source home reads.
  const bookings: MemberBookingHistoryEntry[] = bookingsQuery.data ?? [];
  const now = Date.now();
  const attended = useMemo(
    () => bookings.filter((b) => b.status === 'ATTENDED').length,
    [bookings],
  );
  const upcomingCount = useMemo(
    () =>
      bookings.filter(
        (b) =>
          (b.status === 'BOOKED' || b.status === 'WAITLIST') &&
          new Date(b.classInstance.startsAt).getTime() >= now,
      ).length,
    [bookings, now],
  );

  const stats = [
    {
      key: 'streak',
      label: t('member.home.dayStreak'),
      value: Math.min(attended, 30),
      glyph: '🔥',
    },
    { key: 'visits', label: t('member.home.checkInsMonth'), value: attended, glyph: '✅' },
    { key: 'booked', label: t('member.home.classesBooked'), value: upcomingCount, glyph: '📅' },
  ];

  // Milestones unlocked purely from real visit counts — no fabricated progress.
  const badges = [
    {
      key: 'first',
      label: t('member.profileHub.badgeFirstClass'),
      glyph: '⚡',
      got: attended >= 1,
    },
    {
      key: 'regular',
      label: t('member.profileHub.badgeRegular'),
      glyph: '🔥',
      got: attended >= 25,
    },
    { key: 'v50', label: t('member.profileHub.badgeVisits50'), glyph: '🎯', got: attended >= 50 },
    {
      key: 'v100',
      label: t('member.profileHub.badgeVisits100'),
      glyph: '🏆',
      got: attended >= 100,
    },
  ];

  const version = Constants.expoConfig?.version ?? '—';

  const fmtDate = (iso: string): string =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  // ---- membership card derived values ------------------------------------
  const status = subscription?.status ?? null;
  const isFrozen = status === 'FROZEN';
  const canFreeze =
    subscription != null &&
    status != null &&
    FREEZABLE.has(status) &&
    subscription.freezeDaysRemaining > 0;
  const statusLabel = status ? t(`member.membership.status.${status}`) : '';
  const planLabel = subscription?.planName?.trim() || statusLabel;
  const memberSinceYear = subscription ? new Date(subscription.memberSince).getFullYear() : null;
  const totalDays = subscription
    ? periodDays(subscription.currentPeriodStart, subscription.currentPeriodEnd)
    : 0;
  const daysLeft = subscription ? daysUntil(subscription.currentPeriodEnd) : 0;
  // Remaining-time bar, mirroring home: 22 of 30 days left ⇒ 73% full.
  const periodPct = totalDays > 0 ? Math.min(100, Math.round((daysLeft / totalDays) * 100)) : 0;

  // ---- freeze / resume actions -------------------------------------------
  // Duration presets, filtered to what this period's allowance still covers; a
  // member with fewer than a week left is offered a single "use it all" option.
  const freezePresets = useMemo(() => {
    const remaining = subscription?.freezeDaysRemaining ?? 0;
    const presets = [7, 14, 30].filter((d) => d <= remaining);
    return presets.length > 0 ? presets : remaining > 0 ? [remaining] : [];
  }, [subscription?.freezeDaysRemaining]);
  const [freezeDays, setFreezeDays] = useState<number | null>(null);
  const selectedFreeze = freezeDays ?? freezePresets[0] ?? null;

  const openFreeze = (): void => {
    setFreezeDays(freezePresets[0] ?? null);
    setFreezeOpen(true);
  };

  const confirmFreeze = (): void => {
    if (!subscription || selectedFreeze == null) return;
    freezeMutation.mutate(
      { id: subscription.id, durationDays: selectedFreeze },
      {
        onSuccess: (result) => {
          if (result.ok) {
            setFreezeOpen(false);
            toast.success(
              t('member.membership.freeze.frozenToast', { date: fmtDate(result.frozenUntil) }),
            );
          } else if (result.code === 'EXCEEDS_FREEZE_ALLOWANCE') {
            toast.error(
              t('member.membership.freeze.errAllowance', {
                days: result.remainingDays ?? subscription.freezeDaysRemaining,
              }),
            );
          } else {
            toast.error(t('member.membership.freeze.errGeneric'));
          }
        },
        onError: () => toast.error(t('member.membership.freeze.errGeneric')),
      },
    );
  };

  const resumeMembership = (): void => {
    if (!subscription) return;
    unfreezeMutation.mutate(
      { id: subscription.id },
      {
        onSuccess: (result) => {
          if (result.ok) {
            toast.success(t('member.membership.freeze.resumedToast'));
          } else {
            toast.error(t('member.membership.freeze.errGeneric'));
          }
        },
        onError: () => toast.error(t('member.membership.freeze.errGeneric')),
      },
    );
  };

  // ---- sign out ----------------------------------------------------------
  const performSignOut = (): void => {
    setSigningOut(true);
    void logout()
      .catch(() => undefined)
      .finally(() => {
        // The root route guard handles navigation off this screen; toast confirms.
        toast.success(t('settings.about.signedOut'));
      });
  };
  const confirmSignOut = (): void => {
    Alert.alert(t('settings.about.signOut'), t('settings.about.signOutConfirm'), [
      { text: t('settings.about.signOutCancel'), style: 'cancel' },
      { text: t('settings.about.signOut'), style: 'destructive', onPress: performSignOut },
    ]);
  };

  // Settings menu — only rows with a real mobile destination, so nothing is dead.
  const menu = [
    {
      key: 'notifications',
      glyph: '🔔',
      label: t('settings.preferences.notifications'),
      hint: t('settings.preferences.notificationsHint'),
      onPress: () => router.push('/profile/notifications'),
    },
    {
      key: 'training',
      glyph: '🏋️',
      label: t('training.title'),
      hint: t('member.home.forTraining'),
      onPress: () => router.push('/profile/training'),
    },
    {
      key: 'trainers',
      glyph: '👥',
      label: t('member.trainers.title'),
      hint: t('member.trainers.eyebrow'),
      onPress: () => router.push('/trainers'),
    },
  ];

  return (
    <View className="flex-1 bg-ink-950">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- top app bar ---- */}
        <View className="items-center px-5">
          <Text className="text-lg font-extrabold tracking-tight text-white">
            {t('member.profile.title')}
          </Text>
        </View>

        <View className="gap-5 px-5">
          {/* ---- identity header ---- */}
          <View className="items-center">
            <View className="h-24 w-24 items-center justify-center rounded-full border-2 border-brand-500 bg-brand-600">
              <Text className="text-3xl font-black text-white">{initial}</Text>
            </View>
            <Text className="mt-3.5 text-2xl font-extrabold tracking-tight text-white">
              {memberName}
            </Text>
            {memberEmail ? (
              <Text className="mt-0.5 text-sm text-ink-400">{memberEmail}</Text>
            ) : null}
            {subscription ? (
              <View className="mt-2.5 flex-row items-center gap-1.5 rounded-pill border border-brand-400/30 bg-brand-500/20 px-3 py-1">
                <Text className="text-xs">🎟️</Text>
                <Text className="text-xs font-semibold text-brand-200">
                  {planLabel}
                  {memberSinceYear
                    ? ` · ${t('member.membership.memberSince')} ${memberSinceYear}`
                    : ''}
                </Text>
              </View>
            ) : null}
          </View>

          {/* ---- membership card ---- */}
          {subscriptionQuery.isLoading ? (
            <GlassCard className="items-center py-10">
              <ActivityIndicator color="#9184F1" />
            </GlassCard>
          ) : subscription ? (
            <View className="overflow-hidden rounded-card border border-white/15 bg-brand-600 p-5">
              {/* Faked gradient: translucent white overlays over the solid brand fill. */}
              <View className="absolute inset-x-0 top-0 h-px bg-white/40" />
              <View className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
              <View className="absolute -bottom-14 -left-10 h-40 w-44 rounded-full bg-iris-400/20" />

              <View className="flex-row items-center justify-between">
                <Text className="text-[10px] font-bold uppercase tracking-[2px] text-white/70">
                  {t('member.profileHub.membership')}
                </Text>
                <View className="flex-row items-center gap-1.5 rounded-pill border border-white/30 bg-white/20 px-2 py-0.5">
                  <View
                    className={`h-1.5 w-1.5 rounded-full ${status ? statusDotClass(status) : 'bg-ink-300'}`}
                  />
                  <Text className="text-[10px] font-bold text-white">{statusLabel}</Text>
                </View>
              </View>

              <Text className="mt-3 text-3xl font-black tracking-tight text-white">
                {planLabel}
              </Text>

              {/* Billing-period progress — remaining days of the current period. */}
              <View className="mt-4">
                <View className="mb-1.5 flex-row items-end justify-between">
                  <Text className="text-xs font-semibold text-white/80">
                    {t('member.home.daysLeft', { used: daysLeft, total: totalDays })}
                  </Text>
                  <Text className="font-mono text-[11px] text-white/70">
                    {t('member.profileHub.renews', {
                      date: fmtDate(subscription.currentPeriodEnd),
                    })}
                  </Text>
                </View>
                <View className="h-2 overflow-hidden rounded-pill bg-white/20">
                  <View
                    className="h-full rounded-pill bg-white"
                    style={{ width: `${periodPct}%` }}
                  />
                </View>
              </View>

              {isFrozen ? (
                <View className="mt-5">
                  {subscription.frozenUntil ? (
                    <Text className="mb-3 text-xs text-white/80">
                      {t('member.membership.freeze.frozenUntil', {
                        date: fmtDate(subscription.frozenUntil),
                      })}
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={unfreezeMutation.isPending}
                    onPress={resumeMembership}
                    className="h-11 flex-row items-center justify-center rounded-btn bg-white active:bg-ink-100"
                  >
                    {unfreezeMutation.isPending ? (
                      <ActivityIndicator color="#6D28D9" />
                    ) : (
                      <Text className="text-sm font-bold text-brand-700">
                        {t('member.membership.freeze.resume')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ) : canFreeze ? (
                <View className="mt-5">
                  <Pressable
                    accessibilityRole="button"
                    onPress={openFreeze}
                    className="h-11 flex-row items-center justify-center gap-2 rounded-btn border border-white/30 bg-white/15 active:bg-white/25"
                  >
                    <Text className="text-sm">❄️</Text>
                    <Text className="text-sm font-semibold text-white">
                      {t('member.profileHub.freeze')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            /* No live membership — informational, no dead CTA (mobile has no plan
               picker; the member enrols via the front desk / web portal). */
            <GlassCard className="items-center gap-2 px-5 py-8">
              <Text className="text-2xl">🎟️</Text>
              <Text className="text-base font-bold text-white">
                {t('member.membership.noPlan')}
              </Text>
              <Text className="text-center text-sm text-ink-400">
                {t('member.membership.noPlanHint')}
              </Text>
            </GlassCard>
          )}

          {/* ---- training stats ---- */}
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
              {t('member.profileHub.achievements')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
            >
              {badges.map((b) => (
                <View
                  key={b.key}
                  className={`w-24 items-center rounded-card border p-3 ${
                    b.got
                      ? 'border-brand-400/25 bg-brand-500/10'
                      : 'border-white/[0.06] bg-white/[0.02]'
                  }`}
                  style={{ opacity: b.got ? 1 : 0.5 }}
                >
                  <View
                    className={`h-11 w-11 items-center justify-center rounded-full ${
                      b.got ? 'bg-brand-500/20' : 'bg-white/5'
                    }`}
                  >
                    <Text className="text-lg">{b.glyph}</Text>
                  </View>
                  <Text className="mt-2 text-center text-[11px] font-semibold text-white">
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
                <Text className="text-sm font-semibold text-white">{t('notifications.push')}</Text>
                <Text className="text-xs text-ink-400">{t('notifications.pushHint')}</Text>
              </View>
              <Switch
                value={prefs.push}
                onValueChange={(next) => void setPrefs({ push: next })}
                trackColor={{ false: '#2A2A33', true: '#7C3AED' }}
                thumbColor="#ffffff"
              />
            </View>
            <View className="flex-row items-center gap-3 border-t border-white/[0.06] px-4 py-3.5">
              <View className="h-9 w-9 items-center justify-center rounded-btn bg-accent-500/15">
                <Text className="text-base">⏰</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-white">
                  {t('notifications.classReminders')}
                </Text>
                <Text className="text-xs text-ink-400">
                  {t('notifications.classRemindersHint')}
                </Text>
              </View>
              <Switch
                value={prefs.classReminders}
                disabled={!prefs.push}
                onValueChange={() => void toggle('classReminders')}
                trackColor={{ false: '#2A2A33', true: '#7C3AED' }}
                thumbColor="#ffffff"
              />
            </View>
          </GlassCard>

          {/* ---- language ---- */}
          <View className="flex-row gap-2 rounded-card border border-white/10 bg-white/5 p-1">
            {locales.map((option) => {
              const active = option === locale;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setLocale(option)}
                  className={`flex-1 items-center rounded-btn py-2.5 ${
                    active ? 'bg-white' : 'active:bg-white/10'
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${active ? 'text-ink-950' : 'text-ink-300'}`}
                  >
                    {localeNames[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ---- settings menu ---- */}
          <GlassCard>
            {menu.map((m, i) => (
              <Pressable
                key={m.key}
                accessibilityRole="button"
                onPress={m.onPress}
                className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-white/5 ${
                  i > 0 ? 'border-t border-white/[0.06]' : ''
                }`}
              >
                <View className="h-9 w-9 items-center justify-center rounded-btn bg-brand-500/15">
                  <Text className="text-base">{m.glyph}</Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-white">{m.label}</Text>
                  <Text className="text-xs text-ink-400" numberOfLines={1}>
                    {m.hint}
                  </Text>
                </View>
                <Text className="text-ink-600">›</Text>
              </Pressable>
            ))}
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
            <Text className="text-base font-semibold text-danger-300">
              {t('settings.about.signOut')}
            </Text>
          </Pressable>

          <Text className="text-center font-mono text-[11px] text-ink-600">
            {t('member.shell.brand')} · v{version}
          </Text>
        </View>
      </ScrollView>

      {/* ---- freeze membership bottom sheet ---- */}
      <Modal
        visible={freezeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFreezeOpen(false)}
      >
        <Pressable className="flex-1 justify-end bg-black/70" onPress={() => setFreezeOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-[28px] border-t border-white/10 bg-ink-900 px-6 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
          >
            <View className="items-center">
              <View className="h-1 w-10 rounded-full bg-white/20" />
            </View>
            <Text className="mt-4 text-xl font-extrabold tracking-tight text-white">
              {t('member.membership.freeze.modalTitle')}
            </Text>
            <Text className="mt-1 text-sm text-ink-400">
              {t('member.membership.freeze.modalBody', {
                days: subscription?.freezeDaysRemaining ?? 0,
              })}
            </Text>

            <Text className="mt-5 text-[11px] font-semibold uppercase tracking-[1px] text-ink-500">
              {t('member.membership.freeze.durationLabel')}
            </Text>
            <View className="mt-2.5 flex-row gap-2.5">
              {freezePresets.map((d) => {
                const active = selectedFreeze === d;
                return (
                  <Pressable
                    key={d}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setFreezeDays(d)}
                    className={`flex-1 items-center rounded-card border py-3 ${
                      active
                        ? 'border-brand-400/40 bg-brand-500/20'
                        : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    <Text className="text-lg font-extrabold text-white">{d}</Text>
                    <Text className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-400">
                      {t('member.profileHub.days')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="mt-4 text-xs text-ink-400">
              {t('member.membership.freeze.durationHint')}
            </Text>

            <View className="mt-5 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => setFreezeOpen(false)}
                className="h-12 flex-1 items-center justify-center rounded-btn border border-white/15 bg-white/[0.07] active:bg-white/[0.12]"
              >
                <Text className="font-semibold text-white">
                  {t('member.membership.freeze.cancel')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={freezeMutation.isPending || selectedFreeze == null}
                onPress={confirmFreeze}
                className="h-12 flex-[1.4] flex-row items-center justify-center rounded-btn bg-brand-600 active:bg-brand-700"
                style={{ opacity: freezeMutation.isPending || selectedFreeze == null ? 0.6 : 1 }}
              >
                {freezeMutation.isPending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="font-bold text-white">
                    {t('member.membership.freeze.confirmFreeze')}
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
