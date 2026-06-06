import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// In-app toast notifications. A small, dependency-free implementation: a single
// toast renders at the top of the screen, auto-dismisses, and can be tapped to
// dismiss early. Exposes `useToast()` with `success` / `error` / `info` presets
// so call sites stay terse. Must be mounted *inside* a `SafeAreaProvider` (it
// reads the top inset) — `AppProviders` guarantees that ordering.

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface ToastApi {
  /** Show a toast with an explicit variant (defaults to `info`). */
  show: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /** Dismiss the current toast immediately. */
  hide: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Background per variant (success green, error red, brand-500 for info). */
const VARIANT_BG: Record<ToastVariant, string> = {
  success: '#16a34a',
  error: '#dc2626',
  info: '#2f7bff',
};

const AUTO_HIDE_MS = 3000;
const FADE_MS = 150;

/** Mounts the toast host and provides {@link useToast} to the tree. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const hide = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setToast(null);
      },
    );
  }, [opacity]);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      counter.current += 1;
      setToast({ id: counter.current, message, variant });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(hide, AUTO_HIDE_MS);
    },
    [hide, opacity],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message: string) => show(message, 'success'),
      error: (message: string) => show(message, 'error'),
      info: (message: string) => show(message, 'info'),
      hide,
    }),
    [show, hide],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.host, { top: insets.top + 8, opacity }]}
        >
          <Pressable
            accessibilityRole="alert"
            accessibilityLabel={toast.message}
            onPress={hide}
            style={[styles.toast, { backgroundColor: VARIANT_BG[toast.variant] }]}
          >
            <Text style={styles.text}>{toast.message}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  toast: {
    maxWidth: 420,
    width: '100%',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});

/** Access the toast API. Throws outside a provider. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>.');
  return ctx;
}
