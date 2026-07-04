import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthButton, AuthError, AuthField, AuthNote } from '../../components/auth/form-controls';
import { requestPasswordReset } from '../../lib/auth';
import { useTranslation } from '../../providers';

// "Forgot password" screen. POSTs the email to /auth/forgot-password; the API
// always returns the same generic acknowledgement (it never reveals whether the
// address is registered), so on success we show a neutral "check your inbox"
// note. The emailed link deep-links back to (auth)/reset-password with a token.
export default function ForgotPasswordScreen() {
  const t = useTranslation();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const canSubmit = email.trim().length > 0 && !pending && !sent;

  const onSubmit = (): void => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    requestPasswordReset(email.trim())
      .then(() => {
        setPending(false);
        setSent(true);
      })
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : t('auth.genericError'));
      });
  };

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
              {t('auth.forgot.title')}
            </Text>
            <Text className="text-base text-ink-300">{t('auth.forgot.subtitle')}</Text>
          </View>

          <View className="gap-4">
            <AuthError message={error} />
            <AuthNote message={sent ? t('auth.forgot.sent') : null} />
            <AuthField
              label={t('auth.fields.email')}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.fields.emailPlaceholder')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!pending && !sent}
            />
            <AuthButton
              label={t('auth.forgot.submit')}
              busyLabel={t('auth.forgot.submitting')}
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
