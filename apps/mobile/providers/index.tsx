import type { ReactNode } from 'react';
import { I18nProvider } from './I18nProvider';
import { QueryProvider } from './QueryProvider';
import { ThemeProvider } from './ThemeProvider';
import { ToastProvider } from './ToastProvider';

/**
 * Single mount point for every app-wide provider, nested in dependency order:
 *
 *   Theme  (system light/dark)  →
 *   Query  (TanStack data cache) →
 *   I18n   (locale + translator) →
 *   Toast  (in-app feedback)
 *
 * Mounted from the root layout *inside* `SafeAreaProvider`, which the Toast host
 * depends on for the top inset.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <I18nProvider>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

export { useTheme } from './ThemeProvider';
export { useI18n, useTranslation } from './I18nProvider';
export { useToast } from './ToastProvider';
export type { Theme, ThemeColors } from './ThemeProvider';
export type { I18nContextValue } from './I18nProvider';
export type { ToastApi, ToastVariant } from './ToastProvider';
