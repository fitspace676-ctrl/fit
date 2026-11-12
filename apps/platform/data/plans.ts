/**
 * Monthly plan prices in GEL. One source for the pricing cards and for the
 * structured data search engines read, so the two can never disagree.
 */
export const PLANS = [
  { id: 'studio', monthly: 219 },
  { id: 'club', monthly: 449 },
  { id: 'core', monthly: 649 },
] as const;
