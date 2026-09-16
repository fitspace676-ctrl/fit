// Request a password-reset link.
//
// ## The confirmation must not depend on the answer
//
// `POST /auth/forgot-password` is deliberately indistinguishable whether or not
// the address exists — that is an account-enumeration defence, and a screen that
// branches on the response throws it away. So this screen has exactly one
// success state, shown for every 2xx, and its wording ("if that email is
// registered…") is chosen to be true in both cases.
//
// The sentence is OURS (`auth.forgot.sent`), not the API's. The endpoint answers
// with one hardcoded English sentence — constant, by design — and rendering it
// verbatim puts an English line in the middle of a Georgian screen. `apps/web`
// hit this and fixed it the same way; the catalogue key was already there.
//
// `authStrict`: 5 per 900s. Same cool-down as register and reset.

import { Alert as Advisory, Button } from '@fit/ui-mobile';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { AuthScreen } from '../../components/auth/auth-screen';
import { authErrorKey } from '../../components/auth/auth-error';
import { AuthField } from '../../components/auth/field';
import { CoolDownNotice, OfflineNotice } from '../../components/auth/notices';
import { coolDownSecondsFor, useCoolDown } from '../../components/auth/use-cool-down';
import { useIsOnline } from '../../components/auth/use-online';
import { requestPasswordReset } from '../../lib/auth/session';
import type { MessageKey } from '../../lib/i18n/keys';
import { useI18n } from '../../providers/I18nProvider';

export default function ForgotPasswordScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const online = useIsOnline();
  const coolDown = useCoolDown();

  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [sent, setSent] = useState(false);

  const blocked = pending || coolDown.active || !online;

  const submit = (): void => {
    if (blocked) return;
    setPending(true);
    setErrorKey(null);
    requestPasswordReset(email)
      .then(() => {
        setPending(false);
        setSent(true);
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

  const footer = (
    <Button
      variant="ghost"
      size="md"
      fullWidth
      icon="arrowLeft"
      testID="forgot-back"
      label={t('auth.forgot.backToLogin')}
      onPress={() => {
        router.replace('/login');
      }}
    />
  );

  // Once the link is on its way there is nothing left to fill in, so the form is
  // replaced rather than left standing beside its own confirmation — which would
  // also invite a second submit against a five-request budget.
  if (sent) {
    return (
      <AuthScreen
        testID="forgot"
        title={t('auth.forgot.title')}
        subtitle={t('auth.forgot.subtitle')}
        footer={footer}
      >
        <Advisory
          testID="forgot-sent"
          tone="success"
          live
          icon="mail"
          title={t('auth.forgot.sent')}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      testID="forgot"
      title={t('auth.forgot.title')}
      subtitle={t('auth.forgot.subtitle')}
      footer={footer}
    >
      {/* TODO(i18n): `common.offline.title` / `common.offline.body`. */}
      {online ? null : <OfflineNotice testID="forgot-offline" />}

      {coolDown.active ? (
        <CoolDownNotice testID="forgot-cooldown" secondsLeft={coolDown.secondsLeft} />
      ) : null}

      {errorKey === null ? null : (
        <Advisory testID="forgot-error" tone="danger" live title={t(errorKey)} />
      )}

      <AuthField
        testID="forgot-email"
        label={t('auth.fields.email')}
        placeholder={t('auth.fields.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        disabled={pending}
        invalid={errorKey !== null}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        // The only field on the screen, so there is no chain — "go" straight to
        // submit rather than a "next" that has nowhere to go.
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      <Button
        testID="forgot-submit"
        variant="primary"
        size="lg"
        fullWidth
        label={t('auth.forgot.submit')}
        busyLabel={t('auth.forgot.submitting')}
        busy={pending}
        disabled={coolDown.active || !online}
        onPress={submit}
      />
    </AuthScreen>
  );
}
