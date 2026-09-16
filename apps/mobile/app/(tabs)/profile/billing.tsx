// `/profile/billing` — read what you have been charged.
//
// ===========================================================================
// COPY IS `billing`. THIS SCREEN USES THE INVOICE HALF IN BOTH LOCALES.
//
// `billing.invoices` carries loading, error, empty and the four status labels.
// The unused `billing.credits` copy remains because other clients may use it.
//
// ---------------------------------------------------------------------------
// **There is no `GET /me/invoices`.** The history arrives inside
//             `GET /me/subscription` (`useMembership`), which is why that key
//             carries both and why booking a PT session — which raises an
//             invoice — invalidates the *membership* key. A reader looking for
//             a `useInvoices()` here is looking for a route that does not exist.
//
// ---------------------------------------------------------------------------
// THE PDF IS A BINARY STREAM, NOT AN `<a download>`.
//
// `GET /me/invoices/:invoiceId/pdf` answers `application/pdf` bytes behind a
// Bearer token. The web portal hands that to an anchor; a phone has no anchor,
// no browser download manager and no user-visible filesystem, so the download
// goes to the app cache with the `Authorization` header attached and is then
// handed to the OS share sheet — which is where "save to Files", "mail it" and
// "print" all live. `components/billing/invoice-pdf.ts` owns that, and its
// header records the one `lib/api/` import in this stage and why the seam was
// built for it.

import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppBar,
  EmptyState,
  IconButton,
  ListRow,
  Pill,
  Screen,
  SectionHeader,
  Skeleton,
  Spinner,
  Surface,
  layout,
  spacing,
  useToast,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../../../components/auth/notices';
import { useIsOnline } from '../../../components/auth/use-online';
import { shareInvoicePdf } from '../../../components/billing/invoice-pdf';
import { BILLING_PENDING_COPY } from '../../../components/billing/pending-copy';
import { sectionPhase } from '../../../components/home/section';
import { formatMediumDate } from '../../../components/services/date-format';
import { formatMoney } from '../../../components/services/money';
import { useMembership } from '../../../hooks/queries/useMembership';
import { useGymId } from '../../../hooks/useActiveGym';
import { queryKeys } from '../../../lib/query-keys';
import { LOGIN_ROUTE } from '../../../lib/route-policy';
import { useI18n } from '../../../providers/I18nProvider';

/** Where a sign-in prompted from this screen returns to. */
const BILLING_PATH = '/profile/billing';

export default function BillingScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useIsOnline();
  const gymId = useGymId();
  const scoped = gymId ?? '';

  const membership = useMembership();

  // Which invoice is being fetched, so one row can spin and the rest cannot.
  const [downloading, setDownloading] = useState<string | null>(null);

  const invoices = useMemo(() => membership.data?.invoices ?? [], [membership.data]);

  const invoicesPhase = sectionPhase(membership, online);

  const download = useCallback(
    (invoiceId: string) => {
      if (downloading !== null) return;
      setDownloading(invoiceId);
      void shareInvoicePdf(invoiceId)
        .then((result) => {
          if (result.ok) return;
          // =================================================================
          // THREE REASONS, THREE SENTENCES, AND ONE OF THEM HAS AN ACTION.
          //
          // `invoice-pdf.ts` distinguishes the three deliberately and says so:
          // "every failure is a `reason` the caller turns into a toast". This
          // screen was collapsing all three into `billing.invoices.error`
          // ("Invoices could not be loaded.") — which is not true of any of
          // them: the invoices are on screen, behind the toast.
          //
          // The one that mattered most was `unauthenticated`. The route is
          // `SubscriptionManage`, so an expired session can NEVER produce the
          // file; the member was told the list would not load and offered
          // nothing. Signing back in is the only thing that helps, so that is
          // what the toast says and where the press goes.
          //
          // TODO(i18n): the four sentences — see
          // `components/billing/pending-copy.ts`.
          // =================================================================
          if (result.reason === 'unauthenticated') {
            toast.error(BILLING_PENDING_COPY.downloadExpired);
            router.push(`${LOGIN_ROUTE}?next=${encodeURIComponent(BILLING_PATH)}`);
            return;
          }
          if (result.reason === 'unavailable') {
            // No share sheet on this device. Retrying cannot help, so nothing
            // is offered — "try again" here is a dead instruction.
            toast.error(BILLING_PENDING_COPY.downloadNoShare);
            return;
          }
          toast.error(BILLING_PENDING_COPY.downloadError);
        })
        .finally(() => {
          setDownloading(null);
        });
    },
    [downloading, router, toast],
  );

  return (
    <Screen
      testID="billing-screen"
      header={
        <AppBar
          title={t('billing.title')}
          subtitle={t('billing.subtitle')}
          leading={
            <IconButton
              icon="chevronLeft"
              accessibilityLabel={t('notifications.back')}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/profile');
              }}
              variant="surface"
              testID="billing-back"
            />
          }
        />
      }
    >
      <View style={{ gap: layout.sectionGap }}>
        {online ? null : <OfflineNotice testID="billing-offline" />}

        {/* ── Invoices ───────────────────────────────────────────────────── */}
        <View style={{ gap: spacing[3.5] }}>
          <SectionHeader title={t('billing.invoices.heading')} size="md" />

          {invoicesPhase === 'loading' ? (
            <View
              testID="billing-invoices-loading"
              accessible
              accessibilityLabel={t('billing.invoices.loading')}
              style={{ gap: spacing[2] }}
            >
              <Skeleton height={64} radius={22} />
              <Skeleton height={64} radius={22} />
            </View>
          ) : null}

          {invoicesPhase === 'error' ? (
            <EmptyState
              testID="billing-invoices-error"
              icon="info"
              title={t('billing.invoices.error')}
              action={{
                label: t('billing.retry'),
                onPress: () => {
                  // The invoice list has no key of its own — it rides on the
                  // membership payload. See the header.
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.membership(scoped),
                  });
                },
                variant: 'secondary',
                testID: 'billing-invoices-retry',
              }}
            />
          ) : null}

          {invoicesPhase === 'ready' ? (
            invoices.length === 0 ? (
              <EmptyState
                testID="billing-invoices-empty"
                icon="card"
                title={t('billing.invoices.emptyTitle')}
                body={t('billing.invoices.emptySubtitle')}
              />
            ) : (
              <Surface tone="card" padVertical={1} testID="billing-invoices-list">
                {invoices.map((invoice) => {
                  const amount = formatMoney(invoice.amount, invoice.currency, locale);
                  const date = formatMediumDate(locale, invoice.date);
                  const status = t(`billing.invoices.status${invoice.status}`);
                  return (
                    <ListRow
                      key={invoice.id}
                      testID={`billing-invoice-${invoice.id}`}
                      icon="download"
                      title={amount}
                      hint={`${date} · ${status}`}
                      // The OTHER rows are dead while one downloads — one OS
                      // share sheet at a time — and the spinner below is what
                      // makes that legible rather than arbitrary: without it,
                      // ten rows go grey and nothing on screen says why.
                      disabled={downloading !== null && downloading !== invoice.id}
                      onPress={() => {
                        download(invoice.id);
                      }}
                      // The pill is inside the row's one accessibility node, so
                      // is the spinner — which is why "Downloading…" has to be
                      // in the label rather than only in the glyph.
                      // TODO(i18n) `billing.invoices.downloading`.
                      accessibilityLabel={
                        downloading === invoice.id
                          ? `${amount}, ${date}, ${status}, ${BILLING_PENDING_COPY.downloading}`
                          : `${amount}, ${date}, ${status}`
                      }
                      accessibilityHint={t('member.membership.downloadPdf')}
                      trailing={
                        <View
                          accessible={false}
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                        >
                          {downloading === invoice.id ? (
                            <Spinner
                              size={18}
                              accessibilityLabel={BILLING_PENDING_COPY.downloading}
                              testID={`billing-invoice-${invoice.id}-spinner`}
                            />
                          ) : (
                            <Pill tone={invoice.status === 'PAID' ? 'booked' : 'quiet'} size="sm">
                              {status}
                            </Pill>
                          )}
                        </View>
                      }
                    />
                  );
                })}
              </Surface>
            )
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
