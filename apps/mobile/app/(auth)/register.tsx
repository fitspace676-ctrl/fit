// Create an account.
//
// ## Registration issues NO session
//
// `POST /auth/register` creates the account and sends a verification email; the
// first session arrives later, via `GET /auth/verify?token=` on the `verify`
// screen. So there is nothing for `RouteGuard` to react to here and nothing to
// navigate to — on success the whole form is REPLACED by a "check your inbox"
// panel. Leaving the form standing beside its own confirmation is how a user
// submits twice and spends two of the five requests the limiter allows.
//
// ## `authStrict` — 5 requests per 900 seconds
//
// This is one of the three screens behind it, and the tightest realistic path to
// it is short: two typos and a re-read of the password rules. A 429 carries
// `Retry-After`; the cool-down disables submit and counts down, and nothing here
// auto-retries — retrying a rate-limit response is what the limiter is defending
// against, and it turns a 15-minute wait into a longer one.

import { Alert as Advisory, Button, Text } from '@fit/ui-mobile';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { AuthScreen } from '../../components/auth/auth-screen';
import { authErrorKey } from '../../components/auth/auth-error';
import { AuthField } from '../../components/auth/field';
import { CoolDownNotice, OfflineNotice } from '../../components/auth/notices';
import { coolDownSecondsFor, useCoolDown } from '../../components/auth/use-cool-down';
import { useIsOnline } from '../../components/auth/use-online';
import { registerAccount } from '../../lib/auth/session';
import type { MessageKey } from '../../lib/i18n/keys';
import { useI18n } from '../../providers/I18nProvider';

export default function RegisterScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const online = useIsOnline();
  const coolDown = useCoolDown();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [done, setDone] = useState(false);

  const blocked = pending || coolDown.active || !online;

  const submit = (): void => {
    if (blocked) return;
    setPending(true);
    setErrorKey(null);
    registerAccount({ name, email, password })
      .then(() => {
        setPending(false);
        setDone(true);
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
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="bodySmall" color="textSecondary">
        {t('auth.register.haveAccount')}
      </Text>
      <Button
        variant="ghost"
        size="sm"
        testID="register-login-link"
        label={t('auth.register.loginLink')}
        onPress={() => {
          router.replace('/login');
        }}
      />
    </View>
  );

  // THE FORM IS GONE, not disabled. There is no second thing to submit and no
  // field left worth reading; what remains is one instruction and one way out.
  if (done) {
    return (
      <AuthScreen
        testID="register"
        title={t('auth.register.title')}
        subtitle={t('auth.register.subtitle')}
        footer={footer}
      >
        <Advisory
          testID="register-success"
          tone="success"
          // `live`: the panel appears in place of the form the user was just
          // reading, so a screen reader must be told rather than left on a tree
          // that silently changed underneath it.
          live
          icon="mail"
          title={t('auth.register.success')}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      testID="register"
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
      footer={footer}
    >
      {/* TODO(i18n): `common.offline.title` / `common.offline.body`. */}
      {online ? null : <OfflineNotice testID="register-offline" />}

      {coolDown.active ? (
        <CoolDownNotice testID="register-cooldown" secondsLeft={coolDown.secondsLeft} />
      ) : null}

      {errorKey === null ? null : (
        <Advisory testID="register-error" tone="danger" live title={t(errorKey)} />
      )}

      <AuthField
        testID="register-name"
        label={t('auth.fields.name')}
        placeholder={t('auth.fields.namePlaceholder')}
        value={name}
        onChangeText={setName}
        disabled={pending}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />

      <AuthField
        ref={emailRef}
        testID="register-email"
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
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

      <AuthField
        ref={passwordRef}
        testID="register-password"
        label={t('auth.fields.password')}
        placeholder={t('auth.fields.passwordPlaceholder')}
        // The rule the API enforces (`PASSWORD_MIN_LENGTH`), stated BEFORE it
        // can be broken rather than as a rejection afterwards.
        hint={t('auth.fields.passwordHint')}
        value={password}
        onChangeText={setPassword}
        disabled={pending}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        // `new-password` / `newPassword`, not `password`: this is what makes iOS
        // offer to GENERATE and save a strong one and Android offer to store it,
        // instead of both offering to fill an existing entry.
        autoComplete="new-password"
        textContentType="newPassword"
        revealLabels={{ show: t('auth.showPassword'), hide: t('auth.hidePassword') }}
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      <Text variant="caption" color="textSecondary" testID="register-terms">
        {t('auth.terms')}
      </Text>

      <Button
        testID="register-submit"
        variant="primary"
        size="lg"
        fullWidth
        label={t('auth.register.submit')}
        busyLabel={t('auth.register.submitting')}
        busy={pending}
        disabled={coolDown.active || !online}
        onPress={submit}
      />
    </AuthScreen>
  );
}
