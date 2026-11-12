import { notFound } from 'next/navigation';

/**
 * Any URL no other route claims ends here, so it gets the localized 404 page in
 * `[locale]/not-found.tsx` (with the site's navigation) rather than Next's bare one.
 */
export default function CatchAll() {
  notFound();
}
