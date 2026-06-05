import Link from 'next/link';

/**
 * Landing hero — the acquisition surface's first impression. Badge, headline,
 * supporting copy, and the two primary calls to action: start the owner-signup
 * flow, or jump to pricing. Server component; no interactivity here.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-gutter py-20 text-center sm:py-28">
        <span className="rounded-card bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
          Run your gym on Fit
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          The all-in-one platform for gyms and fitness studios
        </h1>
        <p className="max-w-xl text-lg text-slate-600">
          Memberships, class booking, trainer scheduling, and payments — on your own branded site at{' '}
          <span className="font-medium text-slate-900">yourgym.fit.ge</span>. Launch in minutes, no
          card required.
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register-gym"
            className="rounded-card bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Start free
          </Link>
          <Link
            href="#pricing"
            className="rounded-card border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-600"
          >
            See pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
