// The toast system now lives in the shared @fit/ui-web design system (T1.6),
// where the identical admin + web copies were consolidated into one source.
// Re-exported here so existing `@/src/components/ui` importers resolve unchanged.
export { ToastProvider, useToast, type ToastContextValue } from '@fit/ui-web';
