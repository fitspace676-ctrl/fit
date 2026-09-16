// Email verification — `/verify?token=…`, the target of the emailed button.
//
// ## It is a token exchange, not a form
//
// There is nothing to fill in. The screen redeems the single-use token against
// `GET /auth/verify?token=` on mount and shows one of four states. The exchange
// ISSUES THE ACCOUNT'S FIRST SESSION, which is why it goes through
// `completeEmailVerification` in the session store rather than a raw fetcher:
// the token pair has to be adopted before anything else happens.
//
// ## Four states — and the fourth is not the third
//
//   verifying  — in flight.
//   verified   — redeemed. A session now exists, so `RouteGuard` takes over.
//   missing    — no token on the URL. Nothing was ever going to be sent.
//   invalid    — the API refused it: expired, already used, malformed. One story
//                to the member, whichever it was.
//   failed     — the request never got an answer: offline, timeout, 5xx.
//
// The last two look identical in a screenshot and must not be merged. An invalid
// token is permanent and the only way out is a fresh link; a failed request is
// transient and the way out is the SAME BUTTON, pressed again. Offering "try
// again" for a dead token tells the user to do the same thing twice and hope;
// offering only "sign in for a new link" for a flaky connection throws away a
// perfectly good, still-unspent token. `isRetryable` is what separates them, and
// it reads the status code rather than the server's prose.

import { Alert as Advisory, Button, EmptyState, Spinner, Text } from '@fit/ui-mobile';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AuthScreen } from '../../components/auth/auth-screen';
import { authErrorKey, isRetryable } from '../../components/auth/auth-error';
import { CoolDownNotice, OfflineNotice } from '../../components/auth/notices';
import { coolDownSecondsFor, useCoolDown } from '../../components/auth/use-cool-down';
import { useIsOnline } from '../../components/auth/use-online';
import { completeEmailVerification } from '../../lib/auth/session';
import type { MessageKey } from '../../lib/i18n/keys';
import { useI18n } from '../../providers/I18nProvider';

type VerifyState = 'verifying' | 'verified' | 'invalid' | 'failed';

/** `?token=` may arrive absent, empty, or (from a malformed link) repeated. */
export function firstToken(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

const BODY_GAP = 16;

export default function VerifyScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstToken(params.token);

  const online = useIsOnline();
  const coolDown = useCoolDown();
  const startCoolDown = coolDown.start;

  const [state, setState] = useState<VerifyState>('verifying');
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  // Bumped by the retry button, and a dependency of the effect below. That is
  // what makes "retry" an actual re-run of the one request path instead of a
  // second copy of it living in an `onPress`.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (token === null) return;
    let cancelled = false;
    setState('verifying');
    setErrorKey(null);

    completeEmailVerification(token)
      .then(() => {
        if (!cancelled) setState('verified');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const seconds = coolDownSecondsFor(error);
        if (seconds !== null) {
          startCoolDown(seconds);
          setErrorKey(authErrorKey(error));
          setState('failed');
          return;
        }
        setErrorKey(authErrorKey(error));
        setState(isRetryable(error) ? 'failed' : 'invalid');
      });

    return () => {
      cancelled = true;
    };
  }, [token, attempt, startCoolDown]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  const toLogin = useCallback(() => {
    router.replace('/login');
  }, [router]);

  // One frame, four headings. `verifying` borrows its own copy for the title
  // because the catalogue has no separate heading for it and inventing one is
  // out of scope for this stage; the remaining three all have theirs.
  const heading: { title: string; subtitle?: string } =
    token === null || state === 'invalid'
      ? { title: t('auth.verify.invalidTitle'), subtitle: t('auth.verify.invalidSubtitle') }
      : state === 'verified'
        ? { title: t('auth.verify.successTitle'), subtitle: t('auth.verify.successSubtitle') }
        : state === 'failed'
          ? { title: t('auth.verify.invalidTitle') }
          : { title: t('auth.verify.verifying') };

  const frame = (children: ReactNode) => (
    <AuthScreen testID="verify" title={heading.title} subtitle={heading.subtitle}>
      {children}
    </AuthScreen>
  );

  // ── missing ──────────────────────────────────────────────────────────────
  // No token was ever on the URL, so nothing was attempted and there is nothing
  // to retry. The way out is a fresh link, which starts at sign-in.
  if (token === null) {
    return frame(
      <EmptyState
        testID="verify-missing-token"
        icon="info"
        title={t('auth.verify.missingToken')}
        action={{ label: t('auth.verify.cta'), testID: 'verify-missing-cta', onPress: toLogin }}
      />,
    );
  }

  // ── verifying ────────────────────────────────────────────────────────────
  if (state === 'verifying') {
    return frame(
      <View testID="verify-loading" style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
        {/* `Spinner`'s `accessibilityLabel` is REQUIRED by the package: a busy
            indicator that announces nothing leaves a screen-reader user unable
            to tell "still working" from "finished, and blank". The visible line
            says the same thing, so the two share one string rather than the
            screen inventing a second. */}
        <Spinner accessibilityLabel={t('auth.verify.verifying')} size={28} />
        <Text variant="bodySmall" color="textSecondary">
          {t('auth.verify.verifying')}
        </Text>
      </View>,
    );
  }

  // ── verified ─────────────────────────────────────────────────────────────
  // A session now exists, so `RouteGuard` replaces this route within a frame or
  // two — which is why there is no button. The catalogue's `auth.verify.cta`
  // ("Sign in") is web-shaped: in a browser the verify page holds no session, on
  // the phone the exchange IS the sign-in, and a button sending an
  // already-signed-in user to `/login` would be bounced straight back by zone 3
  // of the guard's own table. The advisory earns its place over the heading
  // alone by being `live` — the state changed under a screen reader that was
  // already reading "Verifying…".
  if (state === 'verified') {
    return frame(
      <Advisory
        testID="verify-success"
        tone="success"
        live
        icon="check"
        title={t('auth.verify.success')}
      />,
    );
  }

  // ── failed (transient) ───────────────────────────────────────────────────
  // The working retry plan §6 item 3 asks for: it re-runs the exchange with the
  // same, still-unspent token.
  //
  // The button is a `Button` in `EmptyState`'s `children` rather than its
  // `action`, because `EmptyStateAction` has no `disabled` — only `busy`, which
  // draws a spinner and would say "retrying" while the truth is "waiting out a
  // rate limit". (Owed back to WP-8b: `EmptyStateAction` should carry
  // `disabled`.)
  if (state === 'failed') {
    return frame(
      <View style={{ gap: BODY_GAP }}>
        {/* TODO(i18n): `common.offline.title` / `common.offline.body` — plan §6
            state 4 has no copy in either catalogue. See `pending-copy.ts`. */}
        {online ? null : <OfflineNotice testID="verify-offline" />}
        {coolDown.active ? (
          <CoolDownNotice testID="verify-cooldown" secondsLeft={coolDown.secondsLeft} />
        ) : null}
        <EmptyState testID="verify-failed" icon="info" title={t(errorKey ?? 'auth.genericError')}>
          <Button
            testID="verify-retry"
            variant="primary"
            label={t('errors.generic.tryAgain')}
            // Retrying into a live cool-down spends one of the five and resets
            // nothing; being offline spends the 15s timeout to reach the same
            // error. Neither is a retry, so neither is offered as one.
            disabled={coolDown.active || !online}
            onPress={retry}
          />
        </EmptyState>
      </View>,
    );
  }

  // ── invalid (permanent) ──────────────────────────────────────────────────
  return frame(
    <EmptyState
      testID="verify-invalid"
      icon="info"
      title={t('auth.verify.missingToken')}
      action={{ label: t('auth.verify.cta'), testID: 'verify-invalid-cta', onPress: toLogin }}
    />,
  );
}
