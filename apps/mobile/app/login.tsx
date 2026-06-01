import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGoogleSignIn } from '../lib/use-google-sign-in';

// Sign-in screen. Renders a "Continue with Google" button wired to the Expo
// AuthSession Google flow; reflects progress / errors from the hook. When no
// Google client id is configured it shows a notice instead of a broken button.
export default function LoginScreen() {
  const { isReady, isConfigured, status, error, signIn } = useGoogleSignIn();
  const busy = status === 'authenticating';

  return (
    <SafeAreaView className="flex-1 bg-brand-950">
      <View className="flex-1 items-center justify-center gap-6 p-gutter">
        <Text className="text-3xl font-bold tracking-tight text-white">Sign in to Fit</Text>
        <Text className="max-w-xs text-center text-base text-brand-200">
          Continue with your Google account to get started.
        </Text>

        {isConfigured ? (
          <Pressable
            accessibilityRole="button"
            disabled={!isReady || busy}
            onPress={signIn}
            className={`rounded-card bg-white px-6 py-3 ${!isReady || busy ? 'opacity-60' : ''}`}
          >
            <Text className="text-base font-medium text-brand-700">
              {busy ? 'Signing you in…' : 'Continue with Google'}
            </Text>
          </Pressable>
        ) : (
          <Text className="max-w-xs text-center text-sm text-brand-300">
            Google sign-in is not configured (set EXPO_PUBLIC_GOOGLE_*_CLIENT_ID).
          </Text>
        )}

        {busy ? <ActivityIndicator color="#ffffff" /> : null}
        {status === 'success' ? (
          <Text className="text-sm text-green-400">Signed in successfully.</Text>
        ) : null}
        {status === 'error' && error ? <Text className="text-sm text-red-400">{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
