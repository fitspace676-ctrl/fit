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
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { CreditPackCatalogueEntry } from '@fit/types';
import { useI18n, useTheme, useToast } from '../../../providers';
import { checkout } from '../../../lib/checkout';
import { fetchCreditPackCatalogue } from '../../../lib/credit-packs';
import { fetchMeInvoices, type MemberBillingInvoice } from '../../../lib/me';

/**
 * Billing screen (T7.10) — the two money surfaces the member portal has and the
 * app did not, reachable from the Profile tab:
 *
 *   • **Buy PT credits** — the gym's catalogue (`GET /credit-packs/catalogue`),
 *     each pack purchasable through the same `POST /checkout` a plan goes
 *     through, with `productType: 'credit_pack'`.
 *   • **Billing history** — what the member has been invoiced
 *     (`GET /me/subscription`, projected onto its `invoices`).
 *
 * The two reads are independent, so each degrades on its own: a spinner, a
 * retryable error, or an empty state, and pull-to-refresh revalidates both. A
 * member with no invoices still gets a working credits picker, and vice versa.
 */
export default function BillingScreen() {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const catalogue = useQuery({
    queryKey: ['credit-pack-catalogue'],
    queryFn: ({ signal }) => fetchCreditPackCatalogue({ signal }),
  });
  const invoices = useQuery({
    queryKey: ['me-invoices'],
    queryFn: ({ signal }) => fetchMeInvoices({ signal }),
  });

  const packs = useMemo(() => catalogue.data ?? [], [catalogue.data]);
  const history = useMemo(() => invoices.data ?? [], [invoices.data]);

  // Which pack is being bought, so only its row spins while the others dim.
  const [buyingId, setBuyingId] = useState<string | null>(null);

  const refreshing =
    (catalogue.isFetching && !catalogue.isLoading) || (invoices.isFetching && !invoices.isLoading);
  const refetch = (): void => {
    void catalogue.refetch();
    void invoices.refetch();
  };

  /**
   * Buy `pack` behind a confirmation. Same contract as buying a plan: the
   * purchase is recorded and the credits granted immediately, but no card is
   * charged — settlement happens at the gym — so the prompt says exactly that.
   */
  const onBuy = useCallback(
    (pack: CreditPackCatalogueEntry) => {
      Alert.alert(
        t('billing.credits.confirmTitle', { name: pack.name }),
        t('billing.credits.confirmBody'),
        [
          { text: t('billing.credits.cancel'), style: 'cancel' },
          {
            text: t('billing.credits.confirmCta'),
            style: 'default',
            onPress: () => {
              setBuyingId(pack.id);
              void checkout({ productType: 'credit_pack', productId: pack.id })
                .then((result) => {
                  if (result.ok) {
                    toast.success(t('billing.credits.boughtToast', { name: pack.name }));
                    // The purchase mints an invoice and moves the balance, so
                    // both lists below are now stale.
                    void invoices.refetch();
                    void catalogue.refetch();
                    return;
                  }
                  toast.error(
                    result.code === 'PRODUCT_UNAVAILABLE'
                      ? t('billing.credits.errUnavailable')
                      : result.code === 'FORBIDDEN'
                        ? t('billing.credits.errNoMembership')
                        : t('billing.credits.errGeneric'),
                  );
                })
                .finally(() => setBuyingId(null));
            },
          },
        ],
      );
    },
    [catalogue, invoices, t, toast],
  );

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={colors.textMuted} />
      }
    >
      <Stack.Screen options={{ title: t('billing.title') }} />

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
          {t('billing.title')}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted }}>{t('billing.subtitle')}</Text>
      </View>

      <Section title={t('billing.credits.heading')} colors={colors}>
        {catalogue.isLoading ? (
          <Loading label={t('billing.credits.loading')} colors={colors} />
        ) : catalogue.isError ? (
          <ErrorState
            message={t('billing.credits.error')}
            retryLabel={t('billing.retry')}
            onRetry={() => void catalogue.refetch()}
            colors={colors}
          />
        ) : packs.length === 0 ? (
          <Empty
            title={t('billing.credits.emptyTitle')}
            subtitle={t('billing.credits.emptySubtitle')}
            colors={colors}
          />
        ) : (
          <View style={{ gap: 12 }}>
            {packs.map((pack) => (
              <CreditPackRow
                key={pack.id}
                pack={pack}
                locale={locale}
                colors={colors}
                busy={buyingId === pack.id}
                disabled={buyingId !== null && buyingId !== pack.id}
                onBuy={onBuy}
                t={t}
              />
            ))}
          </View>
        )}
      </Section>

      <Section title={t('billing.invoices.heading')} colors={colors}>
        {invoices.isLoading ? (
          <Loading label={t('billing.invoices.loading')} colors={colors} />
        ) : invoices.isError ? (
          <ErrorState
            message={t('billing.invoices.error')}
            retryLabel={t('billing.retry')}
            onRetry={() => void invoices.refetch()}
            colors={colors}
          />
        ) : history.length === 0 ? (
          <Empty
            title={t('billing.invoices.emptyTitle')}
            subtitle={t('billing.invoices.emptySubtitle')}
            colors={colors}
          />
        ) : (
          <View style={{ gap: 8 }}>
            {history.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                locale={locale}
                colors={colors}
                t={t}
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
  surface: string;
  primary: string;
  onPrimary: string;
  background: string;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Minor units → a localised amount, e.g. `2500` + `GEL` → `₾25.00`. */
function formatMoney(minor: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
  } catch {
    // An unknown currency code must not blank the row.
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** One buyable credit pack: what it grants, how long it lasts, and its price. */
function CreditPackRow({
  pack,
  locale,
  colors,
  busy,
  disabled,
  onBuy,
  t,
}: {
  pack: CreditPackCatalogueEntry;
  locale: string;
  colors: Colors;
  busy: boolean;
  disabled: boolean;
  onBuy: (pack: CreditPackCatalogueEntry) => void;
  t: Translate;
}) {
  const sessions = t(
    pack.sessionCount === 1 ? 'billing.credits.sessionsOne' : 'billing.credits.sessionsOther',
    { count: pack.sessionCount },
  );
  const validity =
    pack.validityDays == null
      ? t('billing.credits.neverExpires')
      : t('billing.credits.expires', { days: pack.validityDays });

  return (
    <View
      style={{
        gap: 12,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
          {pack.name}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>{sessions}</Text>
        <Text style={{ fontSize: 13, color: colors.textMuted }}>{validity}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: colors.text }}>
          {formatMoney(pack.priceAmount, pack.currency, locale)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('billing.credits.buy')}
          accessibilityState={{ disabled: busy || disabled }}
          testID="credit-pack-buy"
          disabled={busy || disabled}
          onPress={() => onBuy(pack)}
          style={({ pressed }) => ({
            height: 40,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingHorizontal: 20,
            borderRadius: 10,
            backgroundColor: colors.primary,
            opacity: busy || disabled ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          {busy ? <ActivityIndicator size="small" color={colors.onPrimary} /> : null}
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onPrimary }}>
            {busy ? t('billing.credits.buying') : t('billing.credits.buy')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** One line of billing history: when, how much, and whether it settled. */
function InvoiceRow({
  invoice,
  locale,
  colors,
  t,
}: {
  invoice: MemberBillingInvoice;
  locale: string;
  colors: Colors;
  t: Translate;
}) {
  const when = new Date(invoice.date);
  const date = Number.isNaN(when.getTime())
    ? invoice.date
    : when.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  // An unrecognised status falls back to its raw value rather than a blank cell.
  const statusKey = `billing.invoices.status${invoice.status}`;
  const status = t(statusKey);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
          {formatMoney(invoice.amount, invoice.currency, locale)}
        </Text>
        <Text style={{ fontSize: 13, color: colors.textMuted }}>{date}</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted }}>
        {status === statusKey ? invoice.status : status}
      </Text>
    </View>
  );
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

/** An empty state, shared by both sections. */
function Empty({ title, subtitle, colors }: { title: string; subtitle: string; colors: Colors }) {
  return (
    <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{title}</Text>
      <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', maxWidth: 320 }}>
        {subtitle}
      </Text>
    </View>
  );
}
