import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthButton, AuthError, AuthField } from '../../components/auth/form-controls';
import { resetPassword } from '../../lib/auth';
import { useTranslation } from '../../providers';

// Minimum password length the API enforces on a reset (mirrors @fit/types).
const PASSWORD_MIN_LENGTH = 8;

// Reset-password screen, reached from the emailed link via the
// `fit://auth/reset?token=…` deep link (rewritten in `+native-intent`). It reads
// the single-use token from the query, POSTs it with the new password to
// /auth/reset-password, and — since that endpoint issues a fresh session — the
// user walks away signed in; the root guard then routes them onward.
export default function ResetPasswordScreen() {
  const t = useTranslation();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No token means the screen was opened without (or with a malformed) link.
  if (!token) {
    return (
      <SafeAreaView className="flex-1 bg-brand-950">
        <View className="flex-1 justify-center gap-4 p-gutter">
          <Text className="text-3xl font-bold tracking-tight text-white">
            {t('auth.reset.title')}
          </Text>
          <Text className="text-base text-red-400">{t('auth.reset.missingToken')}</Text>
          <Link href="/forgot-password" asChild>
            <Text className="text-base font-medium text-brand-300">{t('auth.forgot.title')}</Text>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  const canSubmit = password.length >= PASSWORD_MIN_LENGTH && !pending;

  const onSubmit = (): void => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    resetPassword(token, password).catch((err: unknown) => {
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
              {t('auth.reset.title')}
            </Text>
            <Text className="text-base text-brand-200">{t('auth.reset.subtitle')}</Text>
          </View>

          <View className="gap-4">
            <AuthError message={error} />
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
            <Text className="text-sm text-brand-300">{t('auth.fields.passwordHint')}</Text>
            <AuthButton
              label={t('auth.reset.submit')}
              busyLabel={t('auth.reset.submitting')}
              busy={pending}
              disabled={!canSubmit}
              onPress={onSubmit}
            />
          </View>

          <Link href="/login" asChild>
            <Text className="text-center text-sm font-medium text-brand-300">
              {t('auth.forgot.backToLogin')}
            </Text>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
