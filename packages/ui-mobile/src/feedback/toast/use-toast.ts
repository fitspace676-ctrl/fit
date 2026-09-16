import { createContext, useContext } from 'react';

// ===========================================================================
// THE TOAST API, KEPT VERBATIM FROM THE SALVAGED PROVIDER.
//
// `show` / `success` / `error` / `info` / `hide`, with `show`'s variant
// defaulting to `'info'`. Call sites in the deleted app depended on exactly
// this shape and the screens being rebuilt in WP-10..15 are ports of those
// call sites, so changing the surface would turn a mechanical port into a
// find-and-replace with no compiler help on the argument ORDER.
//
// What DID change is everything behind it — see `toast-provider.tsx` for the
// repaint (a coloured rectangle becomes the artboards' lime pill) and the move
// from a top anchor to a bottom one.
//
// This file is separate from the provider for one reason: the context object
// has to be importable by the provider without the provider being importable
// by every consumer of the hook. A screen that only calls `useToast()` should
// not pull `react-native`, `Animated` and the whole pill into its module
// graph.
// ===========================================================================

/** The three tones a toast can take. */
export type ToastVariant = 'success' | 'error' | 'info';

/** What {@link useToast} hands back. */
export interface ToastApi {
  /** Show a toast with an explicit variant (defaults to `info`). */
  show: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /** Dismiss the current toast immediately. */
  hide: () => void;
}

/**
 * The context. `null` is the "no provider" sentinel, and it is load-bearing:
 * a default no-op API would let a screen call `toast.success(...)` outside the
 * provider and see absolutely nothing, forever, with no error to chase.
 */
export const ToastContext = createContext<ToastApi | null>(null);

/**
 * Access the toast API.
 *
 * THROWS outside a provider, deliberately. See {@link ToastContext}.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used within a <ToastProvider>.');
  return api;
}
