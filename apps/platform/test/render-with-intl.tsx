import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { platformMessages, type PlatformArea } from '@fit/i18n/platform';

/** The catalogue every component test renders against: English, as shipped. */
export const enMessages = platformMessages.en;

/** Wraps a tree in next-intl's provider with the English platform catalogue. */
function EnglishIntl({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * `render()` with the English platform catalogue in scope, so components that
 * call `useTranslations` render exactly what the English site shows.
 */
export function renderWithIntl(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return render(ui, { wrapper: EnglishIntl, ...options });
}

/**
 * A translator for one area of the English catalogue, outside React — for
 * building the same data the components build (`getTiers(t)`, `getTourScenes(t)`)
 * so a test can compare against it.
 */
export function enTranslator(namespace: PlatformArea) {
  return createTranslator({ locale: 'en', messages: enMessages, namespace });
}
