// Sign in — email + password.
//
// ## This screen does not navigate
//
// On success it calls nothing but `signIn`. The session store flips,
// `RouteGuard` sees it, and the guard is what replaces the route — including
// honouring the `?next=` it wrote when it bounced the user here off an `auth`
// route. That is the plan's rule ("no screen navigates on sign-in itself") and
// it is why `resolveRedirect`'s zone table is the single readable description of
// where a user may be: the old app spread the same decision across five screens'
// `.then()` handlers, which is why its table was wrong for months and untested.
//
// So there is nothing here that reads `next`. The parameter is on the URL, the
// guard reads it, and this screen's only job is to make the session exist.
//
// ## Errors are inline, never a toast
//
// A toast auto-dismisses. A wrong password is not an event, it is a state the
// form is in until the user changes something — and the correction happens at
// the field, which is where the message has to be. The `Alert` sits above the
// fields with `live`, so a screen reader announces it the moment it appears.
//
// An empty or malformed field never reaches the API: the server's answer to it
// is a 400 with no sentence the user can act on, so the form says which field
// and why, under that field. And typing clears the stale verdict — a field
// still painted red while the user is correcting it reads as "still wrong".

// `Alert` is aliased: `react-native` exports one too, and the two are utterly
// different things. The alias makes a future `import { Alert } from 'react-native'`
// impossible to add by accident.
import type { GymSelectionOption } from '@fit/types';
import { Alert as Advisory, Button, Text, spacing } from '@fit/ui-mobile';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { AuthScreen } from '../../components/auth/auth-screen';
import { authErrorKey } from '../../components/auth/auth-error';
import { AuthField } from '../../components/auth/field';
import { CoolDownNotice, OfflineNotice } from '../../components/auth/notices';
import { coolDownSecondsFor, useCoolDown } from '../../components/auth/use-cool-down';
import { useIsOnline } from '../../components/auth/use-online';
import { GymSelectionRequiredError } from '../../lib/api/auth';
import { resolveGymSlug, signIn } from '../../lib/auth/session';
import type { MessageKey } from '../../lib/i18n/keys';
import { useI18n } from '../../providers/I18nProvider';

/** The same shape check the join form's email field uses (`join-state.ts`). */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  readonly email: MessageKey | null;
  readonly password: MessageKey | null;
}

const NO_FIELD_ERRORS: FieldErrors = { email: null, password: null };

/** What is wrong with each field before anything is sent, if anything. */
function loginFieldErrors(email: string, password: string): FieldErrors {
  const address = email.trim();
  return {
    email:
      address === ''
        ? 'auth.login.errors.emailRequired'
        : EMAIL_SHAPE.test(address)
          ? null
          : 'auth.login.errors.emailInvalid',
    password: password === '' ? 'auth.login.errors.passwordRequired' : null,
  };
}

export default function LoginScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const online = useIsOnline();
  const coolDown = useCoolDown();

  // The chain's target. See `components/auth/field.tsx` — the ref reaches the
  // `TextInput` because React 19 passes `ref` to a function component as a prop.
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gymChoices, setGymChoices] = useState<GymSelectionOption[] | null>(null);
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);

  const blocked = pending || coolDown.active || !online;

  const submit = (gymSlug = resolveGymSlug()): void => {
    if (blocked) return;
    const checked = loginFieldErrors(email, password);
    setErrorKey(null);
    setFieldErrors(checked);
    if (checked.email !== null || checked.password !== null) return;
    setPending(true);
    // `gymSlug` is a REQUIRED property of `signIn`'s argument (D4): an optional
    // parameter is one a screen forgets, and a forgotten slug is a member
    // silently signed into the wrong branch. `resolveGymSlug()` answers from the
    // deep link, then the build's pinned slug, then the last successful login.
    signIn({ email, password, gymSlug })
      .then(() => {
        // Deliberately NOT `setPending(false)`. The guard is about to replace
        // this route; re-enabling the button in the gap would let a double-press
        // fire a second `POST /auth/login` against the same rate limiter, and
        // the screen would flash "not busy" on its way out.
      })
      .catch((error: unknown) => {
        setPending(false);
        if (error instanceof GymSelectionRequiredError) {
          setGymChoices(error.gyms);
          return;
        }
        const seconds = coolDownSecondsFor(error);
        if (seconds !== null) {
          coolDown.start(seconds);
          return;
        }
        setErrorKey(authErrorKey(error));
      });
  };

  if (gymChoices !== null) {
    return (
      <AuthScreen
        testID="login-gym-picker"
        title={t('auth.login.chooseGym.title')}
        subtitle={t('auth.login.chooseGym.hint')}
        brand
      >
        {online ? null : <OfflineNotice testID="login-offline" />}
        {coolDown.active ? (
          <CoolDownNotice testID="login-cooldown" secondsLeft={coolDown.secondsLeft} />
        ) : null}
        {errorKey === null ? null : (
          <Advisory testID="login-error" tone="danger" live title={t(errorKey)} />
        )}
        {gymChoices.map((gym) => (
          <Button
            key={gym.slug}
            testID={`login-gym-${gym.slug}`}
            variant="primary"
            size="lg"
            fullWidth
            label={gym.name}
            disabled={blocked}
            onPress={() => submit(gym.slug)}
          />
        ))}
        <Button
          testID="login-gym-back"
          variant="ghost"
          fullWidth
          label={t('auth.login.chooseGym.back')}
          disabled={pending}
          onPress={() => {
            setGymChoices(null);
            setErrorKey(null);
          }}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      testID="login"
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      // The front door: the full logo is centred above the left-aligned title.
      brand
    >
      {/* TODO(i18n): `common.offline.title` / `common.offline.body` — plan §6
          state 4 has no copy in either catalogue. See `pending-copy.ts`. */}
      {online ? null : <OfflineNotice testID="login-offline" />}

      {coolDown.active ? (
        <CoolDownNotice testID="login-cooldown" secondsLeft={coolDown.secondsLeft} />
      ) : null}

      {errorKey === null ? null : (
        <Advisory testID="login-error" tone="danger" live title={t(errorKey)} />
      )}

      <AuthField
        testID="login-email"
        label={t('auth.fields.email')}
        placeholder={t('auth.fields.emailPlaceholder')}
        value={email}
        onChangeText={(text: string) => {
          setEmail(text);
          setErrorKey(null);
          setFieldErrors((current) => ({ ...current, email: null }));
        }}
        disabled={pending}
        error={fieldErrors.email === null ? undefined : t(fieldErrors.email)}
        invalid={errorKey !== null}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        // Android's autofill service and iOS's QuickType strip are different
        // APIs for the same thing; neither is a superset, so both are set.
        autoComplete="email"
        textContentType="emailAddress"
        // The chain. `submitBehavior="submit"` keeps the keyboard up across the
        // hop — the default blurs first, which collapses and re-opens the
        // keyboard between two adjacent fields.
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

      <AuthField
        ref={passwordRef}
        testID="login-password"
        label={t('auth.fields.password')}
        placeholder={t('auth.fields.passwordPlaceholder')}
        value={password}
        onChangeText={(text: string) => {
          setPassword(text);
          setErrorKey(null);
          setFieldErrors((current) => ({ ...current, password: null }));
        }}
        disabled={pending}
        error={fieldErrors.password === null ? undefined : t(fieldErrors.password)}
        invalid={errorKey !== null}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        // Passing `revealLabels` is what turns a `secureTextEntry` field into a
        // revealable one; the strings stay in the app's catalogue.
        revealLabels={{ show: t('auth.showPassword'), hide: t('auth.hidePassword') }}
        // Last field: "go" submits rather than hopping.
        returnKeyType="go"
        onSubmitEditing={() => submit()}
        action={
          <Button
            variant="ghost"
            size="sm"
            testID="login-forgot"
            label={t('auth.login.forgotPassword')}
            onPress={() => {
              router.push('/forgot-password');
            }}
          />
        }
      />

      {/*
        THE SUBMIT STAYS UNDER THE PASSWORD, NOT IN THE FOOTER — a product
        decision (2026-09-30): signing in is what this screen is for, and its
        button belongs next to the two fields it submits.
      */}
      <View style={{ marginTop: spacing[2] }}>
        <Button
          testID="login-submit"
          variant="primary"
          size="lg"
          fullWidth
          label={t('auth.login.submit')}
          busyLabel={t('auth.login.submitting')}
          busy={pending}
          disabled={coolDown.active || !online}
          onPress={() => submit()}
        />
      </View>

      {/*
        JOIN, not just register.
        `/register` mints a login; it does not sell a membership. The join
        funnel — `(join)/checkout`, which signs the buyer up and charges in
        one pass — had NO inbound link anywhere in the app: it was reachable
        only by a `fit://checkout` deep link. So a visitor who browsed the
        public classes, liked one, and tapped Book was offered a sign-in for
        an account they do not have, and no way to become a member at all.
        That is the exact funnel decision D9 exists to protect.

        Every signed-out CTA in the app routes here (`?next=` brings them
        back), so this is the one place the offer has to exist rather than
        five. The copy was authored for it and had gone unread: `auth.join`
        is a complete block in both locales, and the web login draws the
        same tile.

        It sits on the page's own 20pt axis, NOT inside a padded tile: the tile
        added a second inset, so the join button was narrower than the sign-in
        button above it and the two edges never lined up. The space above it
        is what separates it from the form now.

        THE "Don't have an account? Create one" ROW USED TO BE HERE TOO, AND IT
        WAS THE SAME OFFER TWICE. "First time here?" already answers it with
        "Become a member" — the join funnel, which is what a visitor without an
        account actually wants; `/register` mints a login and sells nothing.
        `/register` is still a route, reachable from the verify and invite
        flows — it just no longer competes with the funnel here.
      */}
      <View testID="login-join" style={{ marginTop: spacing[4], gap: spacing[3] }}>
        <View style={{ gap: spacing[1] }}>
          <Text variant="section">{t('auth.join.title')}</Text>
          <Text variant="bodyRegular" color="textSecondary">
            {t('auth.join.subtitle')}
          </Text>
        </View>
        <Button
          variant="secondary"
          size="md"
          fullWidth
          testID="login-join-link"
          label={t('auth.join.cta')}
          onPress={() => {
            router.push('/checkout');
          }}
        />
        {/*
          `caption`, NOT `micro`. `micro` is 10px / 600 UPPERCASE with 0.10em
          tracking — an eyebrow role. A full sentence set in it renders in
          Georgian as MTAVRULI, a display alphabet: Georgian has no sentence
          case, so uppercasing prose changes the script the reader is reading.
          `caption` (12 / 500, sentence case) is the role for helper text.
        */}
        <Text variant="caption" color="textSecondary" testID="login-join-note">
          {t('auth.join.ctaNote')}
        </Text>
      </View>
    </AuthScreen>
  );
}
