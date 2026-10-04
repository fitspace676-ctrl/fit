'use client';

import { useState, type ReactNode } from 'react';
import { LeadCtaContextProvider, type LeadCta } from './lead-cta-context';
import { CallModal, DemoModal } from './lead-modals';

/**
 * Owns the two CTA forms for the whole marketing site, so any button anywhere
 * opens the same modal through {@link useLeadCta} instead of each page keeping
 * its own copy and its own open state.
 */
export function LeadCtaProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<LeadCta | null>(null);
  const close = (): void => setOpen(null);

  return (
    <LeadCtaContextProvider value={setOpen}>
      {children}
      <DemoModal open={open === 'demo'} onClose={close} />
      <CallModal open={open === 'call'} onClose={close} />
    </LeadCtaContextProvider>
  );
}
