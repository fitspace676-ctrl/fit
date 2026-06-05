import Link from 'next/link';

/**
 * Sticky marketing header — brand wordmark, in-page section anchors, and the
 * primary "Start free" call to action that drops the visitor into the
 * owner-signup flow (`/register-gym`). Server component; the nav is plain
 * anchors so no client JS ships for it.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-gutter py-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-brand-600">
          Fit
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 sm:flex">
          <a href="#features" className="transition-colors hover:text-brand-600">
            Features
          </a>
          <a href="#pricing" className="transition-colors hover:text-brand-600">
            Pricing
          </a>
        </nav>
        <Link
          href="/register-gym"
          className="rounded-card bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Start free
        </Link>
      </div>
    </header>
  );
}
