import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthButton, AuthError, AuthField } from '../../components/auth/form-controls';
import { loginWithPassword } from '../../lib/auth';
import { useAppleSignIn } from '../../lib/use-apple-sign-in';
import { useGoogleSignIn } from '../../lib/use-google-sign-in';
import { useTranslation } from '../../providers';

// Sign-in screen. Email/password (POST /auth/login) up top, then "Continue with
// Google" (Expo AuthSession) and, on supported devices, "Continue with Apple"
// (native Sign in with Apple). Every successful path persists a session to the
// keychain via `auth-storage`, which the root `useProtectedRoute` guard observes
// to route the user into onboarding / the app — so no handler navigates itself.
export default function LoginScreen() {
  const t = useTranslation();
  const google = useGoogleSignIn();
  const apple = useAppleSignIn();
  const googleBusy = google.status === 'authenticating';
  const appleBusy = apple.status === 'authenticating';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !pending;

  const onSubmit = (): void => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    loginWithPassword(email.trim(), password).catch((err: unknown) => {
      setPending(false);
      setError(err instanceof Error ? err.message : t('auth.genericError'));
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-brand-950">
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
              {t('auth.login.title')}
            </Text>
            <Text className="text-base text-brand-200">{t('auth.login.subtitle')}</Text>
          </View>

          <View className="gap-4">
            <AuthError message={error} />
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
              autoComplete="current-password"
              textContentType="password"
              secureTextEntry
              editable={!pending}
            />
            <Link href="/forgot-password" asChild>
              <Text className="self-end text-sm font-medium text-brand-300">
                {t('auth.login.forgotPassword')}
              </Text>
            </Link>
            <AuthButton
              label={t('auth.login.submit')}
              busyLabel={t('auth.login.submitting')}
              busy={pending}
              disabled={!canSubmit}
              onPress={onSubmit}
            />
          </View>

          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-brand-800" />
            <Text className="text-sm text-brand-300">{t('auth.orContinueWith')}</Text>
            <View className="h-px flex-1 bg-brand-800" />
          </View>

          <View className="gap-3">
            {google.isConfigured ? (
              <Pressable
                accessibilityRole="button"
                disabled={!google.isReady || googleBusy}
                onPress={google.signIn}
                className={`w-full items-center rounded-card bg-white px-6 py-3 ${
                  !google.isReady || googleBusy ? 'opacity-60' : ''
                }`}
              >
                <Text className="text-base font-medium text-brand-700">
                  {googleBusy ? t('auth.signingIn') : t('auth.continueWithGoogle')}
                </Text>
              </Pressable>
            ) : (
              <Text className="text-center text-sm text-brand-300">
                {t('auth.googleNotConfigured')}
              </Text>
            )}

            {apple.isAvailable ? (
              <Pressable
                accessibilityRole="button"
                disabled={appleBusy}
                onPress={apple.signIn}
                className={`w-full items-center rounded-card bg-black px-6 py-3 ${
                  appleBusy ? 'opacity-60' : ''
                }`}
              >
                <Text className="text-base font-medium text-white">
                  {appleBusy ? t('auth.signingIn') : t('auth.continueWithApple')}
                </Text>
              </Pressable>
            ) : null}

            {google.status === 'error' && google.error ? (
              <Text className="text-sm text-red-400">{google.error}</Text>
            ) : null}
            {apple.status === 'error' && apple.error ? (
              <Text className="text-sm text-red-400">{apple.error}</Text>
            ) : null}
          </View>

          <View className="flex-row justify-center gap-1">
            <Text className="text-sm text-brand-300">{t('auth.login.noAccount')}</Text>
            <Link href="/register" asChild>
              <Text className="text-sm font-medium text-brand-200">
                {t('auth.login.registerLink')}
              </Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
