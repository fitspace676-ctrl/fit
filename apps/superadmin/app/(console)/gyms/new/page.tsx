import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { env } from '@/lib/env';
import { NewGymForm } from './new-gym-form';

export const metadata: Metadata = {
  title: 'New gym — FormaCore SuperAdmin',
  description: 'Provision a gym and onboard its first owner.',
};

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '36rem',
  },
  back: {
    fontSize: '0.8125rem',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-accent)',
    },
    textDecoration: 'none',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * Provisioning a gym from the operator side.
 *
 * The tenant it creates is identical to one an owner creates on the marketing
 * site — same endpoint underneath, same onboarding email — with one difference
 * recorded rather than behavioural: the gym's `createdByUserId` names the
 * operator instead of the owner.
 */
export default function NewGymPage() {
  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/" {...stylex.props(styles.back)}>
        ← All gyms
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>New gym</h1>
        <p {...stylex.props(styles.subtitle)}>
          Creates the tenant and a brand-new owner account, then emails that owner their onboarding
          link. They set their own password from it.
        </p>
      </header>

      <Card>
        <NewGymForm rootDomain={env.NEXT_PUBLIC_ROOT_DOMAIN ?? null} />
      </Card>
    </div>
  );
}
