import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AuthButton,
  AuthError,
  AuthSwitch,
  GlassField,
  SocialButton,
} from '../../components/auth/form-controls';
import { loginWithPassword } from '../../lib/auth';
import { useAppleSignIn } from '../../lib/use-apple-sign-in';
import { useGoogleSignIn } from '../../lib/use-google-sign-in';
import { useTranslation } from '../../providers';

// Formacore "Aurora Glass" sign-in (member-signin-mobile artboard): an immersive
// photo hero with the brand mark, a Sign in / Create account segmented switch,
// glass credential fields with a show-password toggle, then the OAuth options.
//
// Email/password (POST /auth/login), "Continue with Google" (Expo AuthSession)
// and, on supported devices, "Continue with Apple" (native Sign in with Apple)
// each persist a session to the keychain via `auth-storage`, which the root
// `useProtectedRoute` guard observes to route the user onward — so no handler
// navigates itself.

// Hero photograph from the formacore artboard. Darkened by the stacked scrims
// below so the brand mark and heading stay legible over any frame.
const HERO_URI =
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&h=600&fit=crop';

export default function LoginScreen() {
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const google = useGoogleSignIn();
  const apple = useAppleSignIn();
  const googleBusy = google.status === 'authenticating';
  const appleBusy = apple.status === 'authenticating';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <View className="flex-1 bg-ink-950">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="grow"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ---- photo hero ---- */}
          <View className="h-64">
            <Image
              source={{ uri: HERO_URI }}
              resizeMode="cover"
              className="absolute h-full w-full"
            />
            {/* Stacked scrims fake the artboard's top→bottom gradient (React
                Native `className` can't paint a CSS gradient), fading the frame
                into the ink-950 form below. */}
            <View className="absolute inset-0 bg-ink-950/30" />
            <View className="absolute inset-x-0 bottom-0 h-40 bg-ink-950/55" />
            <View className="absolute inset-x-0 bottom-0 h-16 bg-ink-950/85" />

            <View
              className="absolute inset-x-0 top-0 flex-row items-center gap-2.5 px-5"
              style={{ paddingTop: insets.top + 12 }}
            >
              <View className="h-11 w-11 items-center justify-center rounded-btn bg-brand-600">
                <Text className="text-xl font-black text-white">F</Text>
              </View>
              <Text className="text-xl font-extrabold tracking-tight text-white">Fit</Text>
            </View>

            <View className="absolute inset-x-0 bottom-0 px-5 pb-6">
              <Text className="text-3xl font-black tracking-tight text-white">
                {t('auth.login.heroTitle')}
              </Text>
              <Text className="mt-1.5 max-w-[280px] text-sm text-ink-200">
                {t('auth.login.heroSubtitle')}
              </Text>
            </View>
          </View>

          {/* ---- form ---- */}
          <View className="gap-5 px-5 pb-8 pt-5">
            <AuthSwitch
              value="in"
              options={[
                { key: 'in', label: t('auth.tabs.signIn'), onPress: () => {} },
                {
                  key: 'up',
                  label: t('auth.tabs.createAccount'),
                  onPress: () => router.push('/register'),
                },
              ]}
            />

            <View className="gap-3">
              <AuthError message={error} />
              <GlassField
                testID="login-email"
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.fields.emailPlaceholder')}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                editable={!pending}
              />
              <GlassField
                testID="login-password"
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.fields.password')}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                secureTextEntry={!showPassword}
                editable={!pending}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.togglePassword')}
                    hitSlop={8}
                    onPress={() => setShowPassword((s) => !s)}
                  >
                    <Text className="text-sm font-semibold text-ink-300">
                      {showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    </Text>
                  </Pressable>
                }
              />
              <Link href="/forgot-password" asChild>
                <Text className="self-end text-sm font-medium text-brand-300">
                  {t('auth.login.forgotPassword')}
                </Text>
              </Link>
            </View>

            <AuthButton
              testID="login-submit"
              label={t('auth.login.submit')}
              busyLabel={t('auth.login.submitting')}
              busy={pending}
              disabled={!canSubmit}
              onPress={onSubmit}
              trailing={<Text className="text-base font-semibold text-white">→</Text>}
            />

            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-white/10" />
              <Text className="text-xs font-medium uppercase tracking-wider text-ink-500">
                {t('auth.orContinueWith')}
              </Text>
              <View className="h-px flex-1 bg-white/10" />
            </View>

            {apple.isAvailable || google.isConfigured ? (
              <View className="flex-row gap-3">
                {apple.isAvailable ? (
                  <SocialButton
                    className="flex-1"
                    label={appleBusy ? t('auth.signingIn') : t('auth.social.apple')}
                    disabled={appleBusy}
                    onPress={apple.signIn}
                  />
                ) : null}
                {google.isConfigured ? (
                  <SocialButton
                    className="flex-1"
                    label={googleBusy ? t('auth.signingIn') : t('auth.social.google')}
                    disabled={!google.isReady || googleBusy}
                    onPress={google.signIn}
                  />
                ) : null}
              </View>
            ) : (
              <Text className="text-center text-sm text-ink-400">
                {t('auth.googleNotConfigured')}
              </Text>
            )}

            {google.status === 'error' && google.error ? (
              <Text className="text-sm text-danger-300">{google.error}</Text>
            ) : null}
            {apple.status === 'error' && apple.error ? (
              <Text className="text-sm text-danger-300">{apple.error}</Text>
            ) : null}

            <Text className="mt-1 text-center text-xs leading-relaxed text-ink-500">
              {t('auth.terms')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
