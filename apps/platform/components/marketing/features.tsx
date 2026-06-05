import type { ReactElement } from 'react';

/**
 * The feature cards, in display order. The `icon` is an inline SVG path so the
 * marketing page ships no icon-library dependency to the client; `currentColor`
 * lets each icon inherit the brand tint from its wrapper.
 */
const FEATURES: { title: string; description: string; icon: ReactElement }[] = [
  {
    title: 'Memberships & billing',
    description:
      'Sell membership plans and packages, take card payments, and let members renew themselves.',
    icon: (
      <path d="M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z M2 11h20 M7 15h3" />
    ),
  },
  {
    title: 'Class booking',
    description:
      'Publish your timetable and let members reserve spots, join waitlists, and check in from any device.',
    icon: (
      <path d="M8 2v4 M16 2v4 M3 9h18 M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z M9 14l2 2 4-4" />
    ),
  },
  {
    title: 'Trainer scheduling',
    description:
      'Give every trainer a profile and bookable schedule so members can find and book the right coach.',
    icon: <path d="M6 7v10 M3 9v6 M18 7v10 M21 9v6 M6 12h12" />,
  },
  {
    title: 'Your own branded site',
    description:
      'Each gym gets its own subdomain and member app — your brand front and centre, hosted for you.',
    icon: (
      <path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Z M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    ),
  },
];

/**
 * Features grid — four value props for gym owners. The cards and their icons are
 * driven by the {@link FEATURES} list so copy and icons live in one place.
 */
export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-gutter py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Everything your gym needs to run online
        </h2>
        <p className="mt-3 text-slate-600">
          One platform for members, trainers, and staff — so you can spend less time on admin and
          more on your community.
        </p>
      </div>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-card border border-slate-100 bg-white p-6 shadow-sm"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-card bg-brand-50 text-brand-600">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                {feature.icon}
              </svg>
            </span>
            <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
