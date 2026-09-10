// "Your sessions" — the caller's own bookings of THIS service.
//
// Ported from `apps/web/src/components/services/MySessions.tsx`, namespace
// `services.mine`.
//
// ===========================================================================
// HIDDEN WHEN SIGNED OUT, AND HIDDEN WHEN EMPTY — TWO DIFFERENT REASONS.
//
// Signed out there is no `/me/service-sessions` to call at all (the controller
// is `ClassBook`), and a section headed "Your sessions" above a sign-in prompt
// on a page whose whole point is that a visitor can browse it would be noise.
// Empty, web returns `null` and the parent drops the heading with it — kept,
// because "Your sessions / (nothing)" on a service nobody has booked yet reads
// as a failure rather than as a fact.
//
// NO CANCEL BUTTON. `admin/service-sessions/:id/cancel` is `ClassWrite`: a
// member can book a session and cannot release one. Plan §7 lists it among the
// product constraints the API imposes. A row here therefore ends at its
// invoice.
//
// The invoice is NULLABLE even on a booked session, so the money line is
// conditional rather than assumed — a booking whose invoice failed to mint
// still has to render.
//
// ---------------------------------------------------------------------------
// HIDDEN WHEN EMPTY IS NOT THE SAME AS HIDDEN WHEN THE QUERY FAILED.
//
// `GET /me/service-sessions` failing left `sessions` as `[]` and this component
// returned `null` — so the whole section, heading and all, silently disappeared.
// A member who has just booked a slot gets a toast that auto-dismisses and then
// no receipt anywhere: the section that holds the invoice number and the PENDING
// status is simply not on the page, and nothing says a request failed.
//
// That is the same shape as every other finding in this pass — a state inferred
// from the absence of data in a query nobody checked. So the component takes a
// PHASE, and owns its heading in every branch of it, for the reason
// `components/home/section.tsx` gives: "a member reading 'we couldn't load
// this' needs to know WHAT could not be loaded."
//
// EMPTY still renders nothing, deliberately — that behaviour was correct and is
// unchanged. "Your sessions / (nothing)" on a service nobody has booked reads as
// a failure rather than as a fact.
// ===========================================================================

import { View } from 'react-native';
import type { Locale } from '@fit/i18n';
import type { MemberServiceSession } from '@fit/types';
import {
  EmptyState,
  Pill,
  SectionHeader,
  Skeleton,
  Surface,
  Text,
  spacing,
  type PillTone,
} from '@fit/ui-mobile';

import { formatDayHeading, formatTime } from './date-format';
import { formatMoney } from './money';
import { OfflineNotice } from '../auth/notices';
import type { SectionPhase } from '../home/section';
import { useI18n } from '../../providers/I18nProvider';

/** Status → the pill it is drawn in. Web's map, in this palette's vocabulary. */
const STATUS_TONE: Readonly<Record<MemberServiceSession['status'], PillTone>> = {
  OPEN: 'outline',
  BOOKED: 'accent',
  COMPLETED: 'quiet',
  // The palette has exactly one red and it is `danger`; there is no amber.
  CANCELLED: 'danger',
};

export interface MySessionsProps {
  sessions: readonly MemberServiceSession[];
  locale: Locale;
  /** Which branch to draw. See the header — `ready` + empty still draws nothing. */
  phase: SectionPhase;
  /**
   * The error branch's retry. An invalidation of the sessions root, never a
   * `.refetch()` — the caller owns the key.
   */
  onRetry: () => void;
}

/** The member's sessions of one service, with its own four branches. */
export function MySessions({ sessions, locale, phase, onRetry }: MySessionsProps) {
  const { t } = useI18n();

  // The one case that draws nothing at all: the query answered, and the answer
  // is that this member has never booked this service.
  if (phase === 'ready' && sessions.length === 0) return null;

  if (phase !== 'ready') {
    return (
      <View style={{ gap: spacing[3] }} testID="my-sessions">
        {/* The heading survives its own failure — otherwise "we couldn't load
            this" sits on the page with nothing saying what "this" was. */}
        <SectionHeader title={t('services.mine.title')} />

        {phase === 'offline' ? (
          // TODO(i18n): `common.offline.title` / `common.offline.body`.
          <OfflineNotice testID="my-sessions-offline" />
        ) : null}

        {phase === 'loading' ? (
          <View
            testID="my-sessions-loading"
            accessible
            accessibilityLabel={t('account.bookings.loading')}
          >
            <Skeleton height={72} radius={22} />
          </View>
        ) : null}

        {phase === 'error' ? (
          // `account.bookings.*`, not `services.*`: this is the SAME query
          // `profile/bookings.tsx` reads (`GET /me/service-sessions`) and the
          // same sentence it renders for it — translated in both locales.
          // `services.error` says "we could not load the services", which is
          // not what failed here.
          <EmptyState
            testID="my-sessions-error"
            icon="info"
            title={t('account.bookings.error')}
            action={{
              label: t('account.bookings.retry'),
              onPress: onRetry,
              variant: 'secondary',
              testID: 'my-sessions-retry',
            }}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: spacing[3] }} testID="my-sessions">
      <SectionHeader title={t('services.mine.title')} />
      {sessions.map((session) => {
        const when = `${formatDayHeading(locale, session.startsAt)} · ${formatTime(
          locale,
          session.startsAt,
        )}`;
        return (
          <Surface
            key={session.id}
            tone="tile"
            padding={4}
            radius={22}
            testID={`my-session-${session.id}`}
          >
            <View style={{ gap: spacing[2] }}>
              <Text variant="body" color="textPrimary">
                {when}
              </Text>
              <Text variant="caption" color="textSecondary">
                {/* ` · ` is punctuation, not copy — web joins the same pair. */}
                {`${session.serviceName} · ${session.staffName}`}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: spacing[2],
                }}
              >
                <Pill tone={STATUS_TONE[session.status]} size="sm">
                  {t(`services.mine.status.${session.status}`)}
                </Pill>
                {session.invoice !== null ? (
                  <Text
                    variant="caption"
                    color="textSecondary"
                    testID={`my-session-invoice-${session.id}`}
                  >
                    {`${session.invoice.number} · ${formatMoney(
                      session.invoice.amount,
                      session.invoice.currency,
                      locale,
                    )} · ${t(`services.mine.invoice.${session.invoice.status}`)}`}
                  </Text>
                ) : null}
              </View>
            </View>
          </Surface>
        );
      })}
    </View>
  );
}
