import type { Metadata } from 'next';
import PlatformLanding from '@/components/marketing/platform-landing';

export const metadata: Metadata = {
  title: 'FormaCore - Built For The Businesses That Move People.',
};

/**
 * Marketing homepage — the apex (`formacore.io`) acquisition surface. A faithful
 * build of the "Marketing / platform" design: a dark "Aurora Glass" product page
 * with an interactive module explorer. Its two calls to action are "Book a demo"
 * and "Request a call".
 */
export default function HomePage() {
  return <PlatformLanding />;
}
