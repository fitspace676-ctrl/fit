import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { verifyEmail } from '../../lib/auth';
import { useTranslation } from '../../providers';

type VerifyStatus = 'verifying' | 'success' | 'error';

// Email-verification landing screen, reached from the emailed link via the
// `fit://auth/verify?token=…` deep link (rewritten in `+native-intent`). It
// calls GET /auth/verify with the token on mount; that endpoint issues the
// account's first session, so a success persists tokens and the root guard
// routes the now-signed-in user into onboarding / the app on its own.
export default function VerifyScreen() {
  const t = useTranslation();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [status, setStatus] = useState<VerifyStatus>(token ? 'verifying' : 'error');
  const [error, setError] = useState<string | null>(token ? null : t('auth.verify.missingToken'));

  useEffect(() => {
    if (!token) return;
    let active = true;
    verifyEmail(token)
      .then(() => {
        if (active) setStatus('success');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : t('auth.verify.missingToken'));
      });
    return () => {
      active = false;
    };
    // Verify exactly once per token. `t` is read for the fallback message only;
    // re-running on a locale change would re-POST an already-consumed token.
  }, [token]);

  return (
    <SafeAreaView className="flex-1 bg-ink-950">
      <View className="flex-1 items-center justify-center gap-4 p-gutter">
        {status === 'verifying' ? (
          <>
            <ActivityIndicator color="#ffffff" size="large" />
            <Text className="text-base text-ink-300">{t('auth.verify.verifying')}</Text>
          </>
        ) : null}
        {status === 'success' ? (
          <Text className="text-center text-lg font-medium text-success-300">
            {t('auth.verify.success')}
          </Text>
        ) : null}
        {status === 'error' ? (
          <>
            <Text className="text-center text-base text-danger-300">{error}</Text>
            <Link href="/login" asChild>
              <Text className="text-base font-medium text-brand-300">
                {t('auth.forgot.backToLogin')}
              </Text>
            </Link>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
