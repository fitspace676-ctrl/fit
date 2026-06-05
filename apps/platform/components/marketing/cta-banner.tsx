import Link from 'next/link';

/**
 * Closing call-to-action band — a final nudge into the owner-signup flow before
 * the footer, for visitors who scrolled past the hero CTA.
 */
export function CtaBanner() {
  return (
    <section className="mx-auto max-w-6xl px-gutter py-20">
      <div className="rounded-card bg-brand-600 px-8 py-14 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-white">
          Ready to run your gym on Fit?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-brand-100">
          Set up your branded site in minutes. No credit card required to start.
        </p>
        <Link
          href="/register-gym"
          className="mt-8 inline-flex rounded-card bg-white px-6 py-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
        >
          Create your gym
        </Link>
      </div>
    </section>
  );
}
