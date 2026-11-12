import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { BackLink, Cap, OpsCard, PageHead } from '@/components/ops';
import { env } from '@/lib/env';
import { NewGymForm } from './new-gym-form';

export const metadata: Metadata = {
  title: 'New gym | FormaCore SuperAdmin',
  description: 'Provision a gym and onboard its first owner.',
};

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '72rem' },
  layout: {
    display: 'grid',
    alignItems: 'start',
    gap: '1.5rem',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      '@media (min-width: 1024px)': 'minmax(0, 1fr) 20rem',
    },
  },
  card: { padding: { default: '1.25rem', '@media (min-width: 768px)': '2rem' }, minWidth: 0 },
  aside: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    border: '1px solid var(--ops-ink-200)',
    borderRadius: 'var(--radius-container)',
    padding: '1.25rem',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  step: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' },
  number: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: '2rem',
    height: '2rem',
    borderRadius: '50%',
    backgroundColor: 'var(--ops-white)',
    color: 'var(--ops-ink-500)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
  },
  title: { fontSize: '0.84375rem', fontWeight: 600, color: 'var(--ops-ink-950)' },
  body: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.78125rem',
    lineHeight: 1.6,
    color: 'var(--ops-ink-600)',
  },
  note: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.75rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--ops-white)',
    fontSize: '0.78125rem',
    lineHeight: 1.6,
    color: 'var(--ops-ink-600)',
  },
  icon: { flexShrink: 0, marginTop: '0.125rem', color: 'var(--ops-ink-400)' },
});

const next = [
  { title: 'Tenant is created', body: 'Active from the first minute, with no locations yet.' },
  {
    title: 'Owner account is created',
    body: 'A forma-new account. The owner sets their own password.',
  },
  {
    title: 'Onboarding link is emailed',
    body: 'The same link appears on the next screen, ready to copy.',
  },
];

export default function NewGymPage() {
  return (
    <div {...stylex.props(styles.page)}>
      <PageHead
        eyebrow={<BackLink href="/" label="Gyms" />}
        title="New gym"
        description="Creates the tenant and a forma-new owner account, then emails that owner their onboarding link. They set their own password from it."
      />
      <div {...stylex.props(styles.layout)}>
        <OpsCard xstyle={styles.card}>
          <NewGymForm rootDomain={env.NEXT_PUBLIC_ROOT_DOMAIN ?? null} />
        </OpsCard>
        <aside {...stylex.props(styles.aside)}>
          <Cap>What happens next</Cap>
          <ol {...stylex.props(styles.steps)}>
            {next.map((step, index) => (
              <li key={step.title} {...stylex.props(styles.step)}>
                <span {...stylex.props(styles.number)} aria-hidden="true">
                  0{index + 1}
                </span>
                <div>
                  <span {...stylex.props(styles.title)}>{step.title}</span>
                  <p {...stylex.props(styles.body)}>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div {...stylex.props(styles.note)}>
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              {...stylex.props(styles.icon)}
            >
              <path d="m12 3 10 18H2L12 3Z M12 9v5m0 3v1" />
            </svg>
            <span>The subdomain is permanent. Check the spelling before you create the gym.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
