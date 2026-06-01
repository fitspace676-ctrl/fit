import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppleSignIn } from '../lib/use-apple-sign-in';
import { useGoogleSignIn } from '../lib/use-google-sign-in';

// Sign-in screen. Renders "Continue with Google" (Expo AuthSession) and, on
// devices that support it, "Continue with Apple" (native Sign in with Apple);
// each reflects progress / errors from its own hook. When a provider isn't
// configured / available it shows a notice (or hides the button) rather than a
// broken control.
export default function LoginScreen() {
  const google = useGoogleSignIn();
  const apple = useAppleSignIn();
  const googleBusy = google.status === 'authenticating';
  const appleBusy = apple.status === 'authenticating';

  return (
    <SafeAreaView className="flex-1 bg-brand-950">
      <View className="flex-1 items-center justify-center gap-6 p-gutter">
        <Text className="text-3xl font-bold tracking-tight text-white">Sign in to Fit</Text>
        <Text className="max-w-xs text-center text-base text-brand-200">
          Continue with your Google or Apple account to get started.
        </Text>

        {google.isConfigured ? (
          <Pressable
            accessibilityRole="button"
            disabled={!google.isReady || googleBusy}
            onPress={google.signIn}
            className={`rounded-card bg-white px-6 py-3 ${
              !google.isReady || googleBusy ? 'opacity-60' : ''
            }`}
          >
            <Text className="text-base font-medium text-brand-700">
              {googleBusy ? 'Signing you in…' : 'Continue with Google'}
            </Text>
          </Pressable>
        ) : (
          <Text className="max-w-xs text-center text-sm text-brand-300">
            Google sign-in is not configured (set EXPO_PUBLIC_GOOGLE_*_CLIENT_ID).
          </Text>
        )}

        {apple.isAvailable ? (
          <Pressable
            accessibilityRole="button"
            disabled={appleBusy}
            onPress={apple.signIn}
            className={`rounded-card bg-black px-6 py-3 ${appleBusy ? 'opacity-60' : ''}`}
          >
            <Text className="text-base font-medium text-white">
              {appleBusy ? 'Signing you in…' : 'Continue with Apple'}
            </Text>
          </Pressable>
        ) : null}

        {googleBusy || appleBusy ? <ActivityIndicator color="#ffffff" /> : null}
        {google.status === 'success' || apple.status === 'success' ? (
          <Text className="text-sm text-green-400">Signed in successfully.</Text>
        ) : null}
        {google.status === 'error' && google.error ? (
          <Text className="text-sm text-red-400">{google.error}</Text>
        ) : null}
        {apple.status === 'error' && apple.error ? (
          <Text className="text-sm text-red-400">{apple.error}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
