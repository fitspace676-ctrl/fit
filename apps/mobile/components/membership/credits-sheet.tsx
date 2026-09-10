// @fit/mobile — buying PT credits. `member.membership.credits` (13 keys).
//
// ===========================================================================
// WHY THIS SHEET EXISTS, AND WHY IT IS HERE RATHER THAN ON BILLING.
//
// The purchase used to sit inline on `/profile/billing`. That screen is now the
// invoice history and nothing else (T1.17), which left `POST /credit-packs/
// purchase` with no entry point anywhere on the phone — the "Buy more" action on
// the membership screen's PT-credits block pushed to a Billing screen that no
// longer sold anything. So the buy flow moved to the block that already shows
// the balance it changes: one screen states the credits and sells them.
//
// The copy was written for exactly this. `member.membership.credits` carries
// `modalTitle`, `modalBody`, `packMeta`, `buy`, `buying`, `boughtToast` and
// `close` — a modal's worth of strings that went unread while the flow lived on
// Billing. They are what this sheet renders.
//
// ---------------------------------------------------------------------------
// TWO NAMESPACES, ON PURPOSE.
//
// The §6 branches (loading / error / empty subtitle) and the validity line have
// no key under `member.membership.credits`; `billing.credits` has all four, and
// they were authored for this same list. The error mapper is the same story and
// is documented on `creditPackErrorKey`: `billing.credits` is the only namespace
// with `errNoMembership`, a real outcome for a token whose `gymId` claim has
// gone stale. Borrowing four sentences beats inventing four that would have to
// be translated and could then disagree with the ones that already exist.
//
// ---------------------------------------------------------------------------
// PICK, THEN CONFIRM. `billing.credits.confirm*` described a second modal over
// the first, which `Sheet` cannot do — one sheet per screen, see `sheet.tsx`.
// Selecting a row and pressing the footer button IS the two-step confirmation,
// the same shape `plan-sheet.tsx` uses for enrolment, and the mutation is
// `retry: false` because a retried purchase is a second order.

import { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  EmptyState,
  ListRow,
  Sheet,
  Skeleton,
  Text,
  spacing,
  useToast,
} from '@fit/ui-mobile';

import { usePurchaseCreditPack } from '../../hooks/mutations/useCreditPackMutations';
import { usePackCatalogue } from '../../hooks/queries/useMembership';
import { formatMoney } from '../services/money';
import { creditPackErrorKey } from './plan-errors';
import { useI18n } from '../../providers/I18nProvider';

export interface CreditsSheetProps {
  open: boolean;
  onClose: () => void;
  testID?: string;
}

/** The credit-pack chooser. */
export function CreditsSheet({ open, onClose, testID = 'credits-sheet' }: CreditsSheetProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const catalogue = usePackCatalogue();
  const purchase = usePurchaseCreditPack();

  const [selected, setSelected] = useState<string | null>(null);

  const packs = catalogue.data?.packs ?? [];
  const chosen = packs.find((pack) => pack.id === selected) ?? null;

  function confirm() {
    if (chosen === null || purchase.isPending) return;
    purchase.mutate(
      { packId: chosen.id },
      {
        onSuccess: () => {
          toast.success(t('member.membership.credits.boughtToast', { count: chosen.sessionCount }));
          setSelected(null);
          onClose();
        },
        onError: (error: unknown) => {
          toast.error(t(creditPackErrorKey(error)));
        },
      },
    );
  }

  return (
    <Sheet
      testID={testID}
      open={open}
      onClose={onClose}
      title={t('member.membership.credits.modalTitle')}
      subtitle={t('member.membership.credits.modalBody')}
      closeAccessibilityLabel={t('member.membership.credits.close')}
      footer={
        packs.length === 0 ? undefined : (
          <Button
            testID={`${testID}-confirm`}
            label={t('member.membership.credits.buy')}
            fullWidth
            disabled={chosen === null}
            busy={purchase.isPending}
            busyLabel={t('member.membership.credits.buying')}
            onPress={confirm}
          />
        )
      }
    >
      <View style={{ gap: spacing[2] }}>
        {catalogue.isPending && catalogue.data === undefined ? (
          <View
            testID={`${testID}-loading`}
            accessible
            accessibilityLabel={t('billing.credits.loading')}
            style={{ gap: spacing[2] }}
          >
            <Skeleton height={64} radius={22} />
            <Skeleton height={64} radius={22} />
          </View>
        ) : null}

        {catalogue.isError ? (
          <EmptyState
            testID={`${testID}-error`}
            icon="info"
            title={t('billing.credits.error')}
            action={{
              label: t('billing.retry'),
              onPress: () => {
                // Like `PlanSheet`, this sheet holds no query key of its own —
                // `queryKeys.packCatalogue(gymId)` belongs to the screen, which
                // invalidates it on close. See `membership.tsx`.
                onClose();
              },
              variant: 'secondary',
              testID: `${testID}-retry`,
            }}
          />
        ) : null}

        {!catalogue.isPending && !catalogue.isError && packs.length === 0 ? (
          <EmptyState
            testID={`${testID}-empty`}
            icon="card"
            title={t('member.membership.credits.noneOnSale')}
            body={t('billing.credits.emptySubtitle')}
          />
        ) : null}

        {packs.map((pack) => {
          const meta = t('member.membership.credits.packMeta', {
            count: pack.sessionCount,
            price: formatMoney(pack.priceAmount, pack.currency, locale),
          });
          const validity =
            pack.validityDays === null
              ? t('billing.credits.neverExpires')
              : t('billing.credits.expires', { days: pack.validityDays });
          return (
            <ListRow
              key={pack.id}
              testID={`${testID}-pack-${pack.id}`}
              title={pack.name}
              // Validity rides on the hint rather than in `value`: a pack name
              // ("10-Session PT Pack") and a right-hand column do not both fit
              // at 402pt, and the name is the thing being chosen.
              hint={`${meta} · ${validity}`}
              icon={selected === pack.id ? 'check' : 'card'}
              onPress={() => {
                setSelected(pack.id);
              }}
              accessibilityLabel={`${pack.name}, ${meta}, ${validity}`}
            />
          );
        })}

        <Text variant="caption" color="textSecondary">
          {t('billing.credits.confirmBody')}
        </Text>
      </View>
    </Sheet>
  );
}
