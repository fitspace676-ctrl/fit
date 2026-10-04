'use client';

import { createContext, useContext } from 'react';

/**
 * The marketing site's two calls to action. Every CTA button on every surface
 * (nav, mobile dock, page heroes, pricing cards) opens one of these two forms.
 */
export type LeadCta = 'demo' | 'call';

const LeadCtaContext = createContext<((cta: LeadCta) => void) | null>(null);

export const LeadCtaContextProvider = LeadCtaContext.Provider;

/**
 * Open the "Book a demo" or "Request a call" form. Kept in its own module, free
 * of the button and modal imports, so the shared nav in `marketing-ui` can use it
 * without an import cycle through `lead-modals`.
 */
export function useLeadCta(): (cta: LeadCta) => void {
  const open = useContext(LeadCtaContext);
  if (!open) throw new Error('useLeadCta must be used inside <LeadCtaProvider>');
  return open;
}
