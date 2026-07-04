import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { ClassInstanceCard, MemberBookingHistoryEntry, ProductSummary } from '@fit/types';
import { useI18n } from '../../providers';
import { useActiveGymId } from '../../hooks/useActiveGym';
import { useSessionProfile } from '../../hooks/useSessionProfile';
import { useMemberBookings } from '../../hooks/useMemberBookings';
import { useClassInstances } from '../../hooks/useClassInstances';
import { useProducts } from '../../hooks/useProducts';
import { formatTime, startOfWeek } from '../../lib/classes';
import { formatMoney } from '../../lib/shop';

// Formacore "Aurora Glass" member home (member-home-mobile artboard) — the tab
// the member lands on. A near-black `ink-950` canvas with the digital
// membership card as the focal element, the member's next booked class, a live
// stat strip, this week's bookable classes, and a shop rail. Everything is wired
// to the SAME queries the rest of the app uses (bookings, class instances,
// products), so the home mirrors live data without a bespoke endpoint; sections
// with nothing to show degrade to a friendly prompt rather than a blank.
//
// The screen is intentionally dark-only (like the sign-in, T7.1): the formacore
// mobile artboards are a single frosted-aurora identity, so this does not track
// the system light/dark theme the way the older themed tabs still do. React
// Native `className` can't paint CSS gradients or backdrop blur, so the card's
// gradient is approximated with a solid brand fill + translucent white overlays,
// the same trick the auth screens use.
//
// The check-in CTAs (`Show check-in QR`, `Check in`) route to the dedicated QR
// tab rather than re-implementing its sheet, so there is one source of truth for
// the scannable code.

/** A short, friendly day label (Today / Tomorrow / weekday) for an instant. */
function dayLabel(iso: string, locale: string, today: string, tomorrow: string): string {
  const target = new Date(iso);
  const now = new Date();
  const dayDiff = Math.round(
    (new Date(target.toDateString()).getTime() - new Date(now.toDateString()).getTime()) /
      86_400_000,
  );
  if (dayDiff === 0) return today;
  if (dayDiff === 1) return tomorrow;
  return target.toLocaleDateString(locale, { weekday: 'short' });
}

/** Occupancy tone (Tailwind bg class) from a filled-fraction, matching the web bar. */
function occupancyTone(value: number, cap: number): string {
  const pct = cap > 0 ? (value / cap) * 100 : 0;
  if (pct >= 100) return 'bg-danger-500';
  if (pct > 85) return 'bg-warning-500';
  if (pct > 60) return 'bg-accent-500';
  return 'bg-success-500';
}

/** A slim occupancy meter — a glass track with a tone-coloured fill. */
function Occupancy({ value, cap }: { value: number; cap: number }) {
  const pct = cap > 0 ? Math.min(Math.round((value / cap) * 100), 100) : 0;
  return (
    <View className="h-1.5 overflow-hidden rounded-pill bg-white/10">
      <View
        className={`h-full rounded-pill ${occupancyTone(value, cap)}`}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}

/** A frosted glass surface — the home's card primitive (dark-only). */
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

/** A time chip (HH:mm over a day label) used down the left of every class row. */
function TimeChip({
  time,
  day,
  className = '',
}: {
  time: string;
  day: string;
  className?: string;
}) {
  return (
    <View
      className={`items-center rounded-card border border-white/10 bg-white/5 px-2 py-2 ${className}`}
    >
      <Text className="font-mono text-sm font-bold text-white">{time}</Text>
      <Text className="font-mono text-[10px] text-ink-500">{day}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();

  const gymId = useActiveGymId();
  const { userId } = useSessionProfile();

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const bookingsQuery = useMemberBookings(gymId, 'all');
  const classesQuery = useClassInstances(gymId, weekStart);
  const productsQuery = useProducts(gymId);

  const [filter, setFilter] = useState('__all');

  const now = Date.now();
  const bookings: MemberBookingHistoryEntry[] = bookingsQuery.data ?? [];
  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'BOOKED' || b.status === 'WAITLIST')
        .filter((b) => new Date(b.classInstance.startsAt).getTime() >= now)
        .sort(
          (a, b) =>
            new Date(a.classInstance.startsAt).getTime() -
            new Date(b.classInstance.startsAt).getTime(),
        ),
    [bookings, now],
  );
  const nextBooking = upcoming[0] ?? null;
  const attended = useMemo(
    () => bookings.filter((b) => b.status === 'ATTENDED').length,
    [bookings],
  );

  const classes: ClassInstanceCard[] = classesQuery.data ?? [];
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const c of classes) if (c.category) seen.add(c.category);
    return Array.from(seen);
  }, [classes]);
  const bookable = useMemo(
    () =>
      classes
        .filter((c) => new Date(c.startsAt).getTime() >= now)
        .filter((c) => filter === '__all' || c.category === filter)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        .slice(0, 6),
    [classes, filter, now],
  );

  const products: ProductSummary[] = productsQuery.data ?? [];
  const topProducts = products.slice(0, 6);

  const memberName = t('member.home.greetingFallbackName');
  const memberId = `FC-${(userId ?? 'member').slice(-4).toUpperCase()}`;
  const today = t('member.home.today');
  const tomorrow = t('member.home.tomorrow');

  const stats = [
    {
      key: 'streak',
      label: t('member.home.dayStreak'),
      value: Math.min(attended, 30),
      glyph: '🔥',
    },
    { key: 'checkins', label: t('member.home.checkInsMonth'), value: attended, glyph: '✅' },
    { key: 'booked', label: t('member.home.classesBooked'), value: upcoming.length, glyph: '📅' },
  ];

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ---- top app bar ---- */}
      <View className="flex-row items-center justify-between px-5">
        <View>
          <Text className="font-mono text-[10px] uppercase tracking-[1.5px] text-ink-500">
            {new Date().toLocaleDateString(locale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
          <Text className="mt-0.5 text-2xl font-extrabold tracking-tight text-white">
            {t('member.home.greeting')}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('member.shell.notifications')}
            onPress={() => router.push('/profile/notifications')}
            className="h-11 w-11 items-center justify-center rounded-btn border border-white/10 bg-white/5 active:bg-white/10"
          >
            <Text className="text-lg">🔔</Text>
            <View className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-500" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('member.shell.viewProfile')}
            onPress={() => router.push('/profile')}
            className="h-11 w-11 items-center justify-center rounded-full border border-brand-500 bg-brand-600"
          >
            <Text className="text-base font-black text-white">
              {memberName.slice(0, 1).toUpperCase()}
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="gap-5 px-5">
        {/* ---- membership card (focal) ---- */}
        <View className="overflow-hidden rounded-card border border-white/15 bg-brand-600 p-5">
          {/* Faked gradient: translucent white overlays over the solid brand fill. */}
          <View className="absolute inset-x-0 top-0 h-px bg-white/40" />
          <View className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <View className="absolute -bottom-14 -left-10 h-40 w-44 rounded-full bg-iris-400/20" />

          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Text className="text-base">⚡</Text>
              <Text className="text-sm font-extrabold tracking-tight text-white">
                {t('member.shell.brand')}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-pill border border-white/30 bg-white/20 px-2 py-0.5">
              <View className="h-1.5 w-1.5 rounded-full bg-success-300" />
              <Text className="text-[10px] font-bold text-white">{t('member.home.active')}</Text>
            </View>
          </View>

          <View className="mt-6 flex-row items-end justify-between">
            <View className="flex-1">
              <Text className="text-3xl font-black tracking-tight text-white">
                {t('member.membership.status.ACTIVE')}
              </Text>
              <Text className="mt-1.5 font-mono text-xs text-white/70">
                {memberName} · {t('member.home.memberId')} {memberId}
              </Text>
            </View>
          </View>

          {/* Billing-period progress (placeholder window, mirrors the web home). */}
          <View className="mt-5">
            <View className="mb-1.5 flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-white/80">
                {t('member.home.daysLeft', { used: 22, total: 30 })}
              </Text>
              <Text className="font-mono text-[11px] text-white/70">73%</Text>
            </View>
            <View className="h-2 overflow-hidden rounded-pill bg-white/20">
              <View className="h-full rounded-pill bg-white" style={{ width: '73%' }} />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/qr')}
            className="mt-5 flex-row items-center justify-center gap-2 rounded-btn bg-white py-4 active:bg-ink-100"
          >
            <Text className="text-base">▦</Text>
            <Text className="text-[15px] font-bold text-brand-700">{t('member.home.showQr')}</Text>
          </Pressable>
        </View>

        {/* ---- next class ---- */}
        <GlassCard className="p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] font-semibold uppercase tracking-[1.5px] text-ink-400">
              {t('member.home.nextClass')}
            </Text>
            {nextBooking ? (
              <View className="flex-row items-center gap-1.5 rounded-pill border border-accent-400/30 bg-accent-500/20 px-2.5 py-1">
                <View className="h-1.5 w-1.5 rounded-full bg-accent-400" />
                <Text className="text-[11px] font-semibold text-accent-200">
                  {dayLabel(nextBooking.classInstance.startsAt, locale, today, tomorrow)}
                </Text>
              </View>
            ) : null}
          </View>

          {bookingsQuery.isLoading ? (
            <View className="items-center py-6">
              <ActivityIndicator color="#9184F1" />
            </View>
          ) : nextBooking ? (
            <>
              <View className="mt-3.5 flex-row items-center gap-3.5">
                <TimeChip
                  time={formatTime(nextBooking.classInstance.startsAt, locale)}
                  day={dayLabel(nextBooking.classInstance.startsAt, locale, today, tomorrow)}
                  className="w-16"
                />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <View
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: nextBooking.classInstance.color || '#9184F1' }}
                    />
                    <Text
                      className="flex-1 text-lg font-bold tracking-tight text-white"
                      numberOfLines={1}
                    >
                      {nextBooking.classInstance.title}
                    </Text>
                  </View>
                  <Text className="mt-1.5 text-xs text-ink-400" numberOfLines={1}>
                    {[nextBooking.classInstance.trainerName, nextBooking.classInstance.room]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <View className="mt-2">
                    <Occupancy
                      value={nextBooking.classInstance.bookedCount}
                      cap={nextBooking.classInstance.capacity}
                    />
                  </View>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/qr')}
                className="mt-4 h-11 flex-row items-center justify-center gap-2 rounded-btn bg-brand-600 active:bg-brand-700"
              >
                <Text className="text-sm">▦</Text>
                <Text className="text-sm font-semibold text-white">{t('member.home.checkIn')}</Text>
              </Pressable>
            </>
          ) : (
            <View className="items-center gap-2 py-6">
              <Text className="text-2xl">📅</Text>
              <Text className="text-sm text-ink-400">{t('member.home.noClasses')}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/classes')}
                className="mt-1 rounded-btn border border-white/15 bg-white/5 px-4 py-2 active:bg-white/10"
              >
                <Text className="text-sm font-semibold text-white">
                  {t('member.home.browseClasses')}
                </Text>
              </Pressable>
            </View>
          )}
        </GlassCard>

        {/* ---- quick stats ---- */}
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

        {/* ---- book a class ---- */}
        <View>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-lg font-bold tracking-tight text-white">
              {t('member.home.bookClass')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/classes')}
              hitSlop={8}
            >
              <Text className="text-xs font-semibold text-brand-300">
                {t('member.home.viewAll')} ›
              </Text>
            </Pressable>
          </View>

          {categories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
            >
              {[
                { key: '__all', label: t('member.home.viewAll') },
                ...categories.map((c) => ({ key: c, label: c })),
              ].map((chip) => {
                const active = filter === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setFilter(chip.key)}
                    className={`h-9 justify-center rounded-pill px-4 ${
                      active ? 'bg-white' : 'border border-white/10 bg-white/5 active:bg-white/10'
                    }`}
                  >
                    <Text
                      className={`text-[13px] font-semibold ${active ? 'text-ink-950' : 'text-ink-300'}`}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <View className="mt-3 gap-2.5">
            {classesQuery.isLoading ? (
              <View className="items-center py-8">
                <ActivityIndicator color="#9184F1" />
              </View>
            ) : bookable.length > 0 ? (
              bookable.map((c) => {
                const full = c.bookedCount >= c.capacity;
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/classes/${c.id}`)}
                    className="overflow-hidden rounded-card border border-white/10 bg-white/5 p-3.5 active:bg-white/10"
                  >
                    <View className="flex-row items-center gap-3">
                      <TimeChip
                        time={formatTime(c.startsAt, locale)}
                        day={dayLabel(c.startsAt, locale, today, tomorrow)}
                        className="w-14"
                      />
                      <View
                        className="h-10 w-1 rounded-full"
                        style={{ backgroundColor: c.color || '#9184F1' }}
                      />
                      <View className="min-w-0 flex-1">
                        <Text className="font-semibold text-white" numberOfLines={1}>
                          {c.title}
                        </Text>
                        <Text className="text-xs text-ink-400" numberOfLines={1}>
                          {[c.trainerName, c.locationName].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <View
                        className={`h-9 justify-center rounded-btn px-4 ${
                          full ? 'bg-warning-500' : 'bg-brand-600'
                        }`}
                      >
                        <Text className="text-xs font-bold text-white">
                          {full ? t('member.home.joinWaitlist') : t('member.home.book')}
                        </Text>
                      </View>
                    </View>
                    <View className="mt-3 flex-row items-center gap-2.5">
                      <View className="flex-1">
                        <Occupancy value={c.bookedCount} cap={c.capacity} />
                      </View>
                      <Text
                        className="font-mono text-[11px] text-ink-500"
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {c.bookedCount}/{c.capacity}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <GlassCard className="items-center gap-2 py-8">
                <Text className="text-2xl">📅</Text>
                <Text className="text-sm text-ink-400">{t('member.home.noBookable')}</Text>
              </GlassCard>
            )}
          </View>
        </View>

        {/* ---- shop rail ---- */}
        <View>
          <View className="mb-3 flex-row items-center justify-between">
            <View>
              <Text className="text-lg font-bold tracking-tight text-white">
                {t('member.home.forTraining')}
              </Text>
              <Text className="mt-0.5 text-xs text-ink-400">{t('member.home.membersGet')}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/shop')} hitSlop={8}>
              <Text className="text-xs font-semibold text-brand-300">
                {t('member.home.visitShop')} ›
              </Text>
            </Pressable>
          </View>

          {productsQuery.isLoading ? (
            <View className="items-center py-8">
              <ActivityIndicator color="#9184F1" />
            </View>
          ) : topProducts.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
            >
              {topProducts.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/shop/product/${p.id}`)}
                  className="w-40 overflow-hidden rounded-card border border-white/10 bg-white/5 active:bg-white/10"
                >
                  <View className="aspect-[4/3] bg-white/5">
                    {p.imageUrl ? (
                      <Image
                        source={{ uri: p.imageUrl }}
                        resizeMode="cover"
                        className="h-full w-full"
                      />
                    ) : (
                      <View className="h-full w-full items-center justify-center">
                        <Text className="text-2xl">🛍️</Text>
                      </View>
                    )}
                  </View>
                  <View className="p-3">
                    <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text
                      className="mt-2 font-mono text-sm font-bold text-brand-300"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {formatMoney(p.priceAmount, p.currency, locale)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <GlassCard className="items-center gap-2 py-8">
              <Text className="text-2xl">🛍️</Text>
              <Text className="text-sm text-ink-400">{t('member.home.noProducts')}</Text>
            </GlassCard>
          )}
        </View>

        {/* ---- upcoming bookings (also the entry point to the Bookings tab) ---- */}
        {upcoming.length > 0 ? (
          <View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-lg font-bold tracking-tight text-white">
                {t('member.home.upcomingBookings')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/bookings')}
                hitSlop={8}
              >
                <Text className="text-xs font-semibold text-brand-300">
                  {t('member.home.viewAll')} ›
                </Text>
              </Pressable>
            </View>
            <GlassCard>
              {upcoming.slice(0, 4).map((b, i) => (
                <Pressable
                  key={b.bookingId}
                  accessibilityRole="button"
                  onPress={() => router.push(`/classes/${b.classInstance.id}`)}
                  className={`flex-row items-center gap-3.5 p-3.5 active:bg-white/5 ${
                    i > 0 ? 'border-t border-white/10' : ''
                  }`}
                >
                  <TimeChip
                    time={formatTime(b.classInstance.startsAt, locale)}
                    day={dayLabel(b.classInstance.startsAt, locale, today, tomorrow)}
                    className="w-14"
                  />
                  <View className="min-w-0 flex-1">
                    <Text className="font-semibold text-white" numberOfLines={1}>
                      {b.classInstance.title}
                    </Text>
                    <Text className="text-xs text-ink-400" numberOfLines={1}>
                      {[b.classInstance.trainerName, b.classInstance.room]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <View
                    className={`rounded-pill px-2.5 py-1 ${
                      b.status === 'WAITLIST' ? 'bg-warning-500/20' : 'bg-success-500/20'
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-semibold ${
                        b.status === 'WAITLIST' ? 'text-warning-300' : 'text-success-300'
                      }`}
                    >
                      {b.status === 'WAITLIST'
                        ? t('member.home.waitlist', { position: b.waitlistPosition ?? 0 })
                        : t('member.home.confirmed')}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </GlassCard>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
