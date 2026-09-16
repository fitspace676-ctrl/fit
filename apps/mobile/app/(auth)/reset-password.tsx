// Set a new password, from the emailed link (`/reset-password?token=…`).
//
// ## No token, no form — ever
//
// A blank or missing `token` can never succeed: the API consumes a single-use
// token and there is nothing this screen could send. Rendering the form anyway
// means the user types a password, presses the button, and is told it failed —
// having handed a password to a screen that was never going to use it. So the
// missing-token branch returns BEFORE any state a form would need, and there is
// no code path on which both exist.
//
// ## A session IS issued here
//
// Unlike register, `POST /auth/reset-password` returns a token pair — the API
// revokes every existing session first, so the user walks away signed in on this
// device and signed out everywhere else, which is the entire point of resetting
// a possibly-compromised password. `completePasswordReset` adopts the pair, the
// store flips, and `RouteGuard` navigates. This screen does not.
//
// `authStrict`: 5 per 900s.

import { Alert as Advisory, Button, EmptyState } from '@fit/ui-mobile';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { AuthScreen } from '../../components/auth/auth-screen';
import { authErrorKey } from '../../components/auth/auth-error';
import { AuthField } from '../../components/auth/field';
import { CoolDownNotice, OfflineNotice } from '../../components/auth/notices';
import { coolDownSecondsFor, useCoolDown } from '../../components/auth/use-cool-down';
import { useIsOnline } from '../../components/auth/use-online';
import { completePasswordReset } from '../../lib/auth/session';
import type { MessageKey } from '../../lib/i18n/keys';
import { useI18n } from '../../providers/I18nProvider';

/** `?token=` may arrive absent, empty, or (from a malformed link) repeated. */
function firstToken(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

export default function ResetPasswordScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = firstToken(params.token);

  const online = useIsOnline();
  const coolDown = useCoolDown();

  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);

  const backToLogin = (): void => {
    router.replace('/login');
  };

  const footer = (
    <Button
      variant="ghost"
      size="md"
      fullWidth
      icon="arrowLeft"
      testID="reset-back"
      label={t('auth.reset.backToLogin')}
      onPress={backToLogin}
    />
  );

  // The dead-link branch. It is FIRST, and it returns, so no form state below is
  // ever reachable with a null token. `EmptyState` is the error state (plan item
  // G-05) and carries the way out as its action rather than only as a footer
  // link — a dead end with no button is how the old app's error boxes read.
  if (token === null) {
    return (
      <AuthScreen testID="reset" title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')}>
        <EmptyState
          testID="reset-missing-token"
          icon="info"
          title={t('auth.reset.missingToken')}
          action={{
            label: t('auth.forgot.submit'),
            testID: 'reset-request-new',
            onPress: () => {
              router.replace('/forgot-password');
            },
          }}
        />
      </AuthScreen>
    );
  }

  const blocked = pending || coolDown.active || !online;

  const submit = (): void => {
    if (blocked) return;
    setPending(true);
    setErrorKey(null);
    completePasswordReset({ token, password })
      .then(() => {
        // No `setPending(false)` and no navigation: a session was just issued,
        // so `RouteGuard` is about to replace this route. See `login.tsx`.
      })
      .catch((error: unknown) => {
        setPending(false);
        const seconds = coolDownSecondsFor(error);
        if (seconds !== null) {
          coolDown.start(seconds);
          return;
        }
        setErrorKey(authErrorKey(error));
      });
  };

  return (
    <AuthScreen
      testID="reset"
      title={t('auth.reset.title')}
      subtitle={t('auth.reset.subtitle')}
      footer={footer}
    >
      {/* TODO(i18n): `common.offline.title` / `common.offline.body`. */}
      {online ? null : <OfflineNotice testID="reset-offline" />}

      {coolDown.active ? (
        <CoolDownNotice testID="reset-cooldown" secondsLeft={coolDown.secondsLeft} />
      ) : null}

      {errorKey === null ? null : (
        <Advisory testID="reset-error" tone="danger" live title={t(errorKey)} />
      )}

      <AuthField
        testID="reset-password"
        label={t('auth.fields.password')}
        placeholder={t('auth.fields.passwordPlaceholder')}
        hint={t('auth.fields.passwordHint')}
        value={password}
        onChangeText={setPassword}
        disabled={pending}
        invalid={errorKey !== null}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        // A NEW password, not the stored one. Telling the password manager which
        // is which is what makes it offer to UPDATE the saved entry instead of
        // filling the old one back in.
        autoComplete="new-password"
        textContentType="newPassword"
        revealLabels={{ show: t('auth.showPassword'), hide: t('auth.hidePassword') }}
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      <Button
        testID="reset-submit"
        variant="primary"
        size="lg"
        fullWidth
        label={t('auth.reset.submit')}
        busyLabel={t('auth.reset.submitting')}
        busy={pending}
        disabled={coolDown.active || !online}
        onPress={submit}
      />
    </AuthScreen>
  );
}
