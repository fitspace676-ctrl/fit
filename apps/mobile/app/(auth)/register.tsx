import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthButton, AuthError, AuthField } from '../../components/auth/form-controls';
// Canvas + accents follow the formacore ink-950 sign-in palette; the glass
// fields come from the shared AuthField.
import { register } from '../../lib/auth';
import { useTranslation } from '../../providers';

// Minimum password length the API enforces (mirrors `PASSWORD_MIN_LENGTH` in
// @fit/types). Checked client-side too so the user gets the hint before a 400.
const PASSWORD_MIN_LENGTH = 8;

// Registration screen. POSTs to /auth/register, which creates the account and
// emails a verification link — no session is issued yet — so on success we show
// a "check your inbox" state rather than navigating into the app. The emailed
// link deep-links back to the (auth)/verify screen, which logs the user in.
export default function RegisterScreen() {
  const t = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= PASSWORD_MIN_LENGTH &&
    !pending;

  const onSubmit = (): void => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    register(email.trim(), password, name.trim())
      .then(() => {
        setSubmitted(true);
      })
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : t('auth.genericError'));
      });
  };

  if (submitted) {
    return (
      <SafeAreaView className="flex-1 bg-ink-950">
        <View className="flex-1 justify-center gap-4 p-gutter">
          <Text className="text-3xl font-bold tracking-tight text-white">
            {t('auth.register.title')}
          </Text>
          <Text className="text-base text-ink-300">{t('auth.register.success')}</Text>
          <Link href="/login" asChild>
            <Text className="text-base font-medium text-brand-300">
              {t('auth.forgot.backToLogin')}
            </Text>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-950">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="grow justify-center gap-5 p-gutter"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-2">
            <Text className="text-3xl font-bold tracking-tight text-white">
              {t('auth.register.title')}
            </Text>
            <Text className="text-base text-ink-300">{t('auth.register.subtitle')}</Text>
          </View>

          <View className="gap-4">
            <AuthError message={error} />
            <AuthField
              label={t('auth.fields.name')}
              value={name}
              onChangeText={setName}
              placeholder={t('auth.fields.namePlaceholder')}
              autoComplete="name"
              textContentType="name"
              editable={!pending}
            />
            <AuthField
              label={t('auth.fields.email')}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.fields.emailPlaceholder')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!pending}
            />
            <AuthField
              label={t('auth.fields.password')}
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.fields.passwordPlaceholder')}
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              secureTextEntry
              editable={!pending}
            />
            <Text className="text-sm text-ink-400">{t('auth.fields.passwordHint')}</Text>
            <AuthButton
              label={t('auth.register.submit')}
              busyLabel={t('auth.register.submitting')}
              busy={pending}
              disabled={!canSubmit}
              onPress={onSubmit}
            />
          </View>

          <View className="flex-row justify-center gap-1">
            <Text className="text-sm text-ink-400">{t('auth.register.haveAccount')}</Text>
            <Link href="/login" asChild>
              <Text className="text-sm font-medium text-brand-300">
                {t('auth.register.loginLink')}
              </Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
