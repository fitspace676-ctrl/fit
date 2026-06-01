// @fit/mobile — "Sign in with Google" hook.
//
// Wraps Expo AuthSession's Google provider: it opens the system browser to
// Google, returns an ID token on success, and exchanges it for a Fit session via
// {@link loginWithGoogle}. Configure the platform client IDs (from the Google
// Cloud console) through EXPO_PUBLIC_* env vars; each must also appear in the
// API's GOOGLE_CLIENT_IDS so the token's audience is accepted.

import { useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { loginWithGoogle, type TokenPair } from './auth';

// Completes the auth session when the app is resumed via the OAuth redirect.
// Safe (and required) to call once at module scope.
WebBrowser.maybeCompleteAuthSession();

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

export type GoogleSignInStatus = 'idle' | 'authenticating' | 'success' | 'error';

export interface UseGoogleSignIn {
  /** True once the auth request is built and {@link signIn} can be invoked. */
  isReady: boolean;
  /** True when at least one Google client id is configured. */
  isConfigured: boolean;
  status: GoogleSignInStatus;
  error: string | null;
  session: TokenPair | null;
  /** Open the Google sign-in flow. */
  signIn: () => void;
}

/**
 * Drive a Google sign-in from a screen: render a button wired to `signIn`, then
 * react to `status` / `error` / `session`. Returns `isConfigured: false` when no
 * client id is set so the screen can degrade gracefully instead of opening a
 * broken flow.
 */
export function useGoogleSignIn(): UseGoogleSignIn {
  const isConfigured = Boolean(webClientId ?? iosClientId ?? androidClientId);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId,
    iosClientId,
    androidClientId,
  });

  const [status, setStatus] = useState<GoogleSignInStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<TokenPair | null>(null);

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      const idToken = response.params.id_token;
      if (!idToken) {
        setStatus('error');
        setError('Google did not return an ID token.');
        return;
      }
      setStatus('authenticating');
      setError(null);
      loginWithGoogle(idToken)
        .then((tokens) => {
          setSession(tokens);
          setStatus('success');
        })
        .catch((err: unknown) => {
          setStatus('error');
          setError(err instanceof Error ? err.message : 'Sign-in failed');
        });
    } else if (response.type === 'error') {
      setStatus('error');
      setError(response.error?.message ?? 'Google sign-in was cancelled or failed.');
    }
  }, [response]);

  return {
    isReady: Boolean(request),
    isConfigured,
    status,
    error,
    session,
    signIn: () => {
      void promptAsync();
    },
  };
}
