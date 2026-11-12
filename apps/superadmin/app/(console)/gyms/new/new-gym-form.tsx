'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Banner, Button } from '@fit/ui-kit';
import { Cap } from '@/components/ops';
import css from './new-gym.module.css';
import { createGymRequestAction } from '../../actions';

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  input: {
    height: '44px',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--ops-ink-50)',
  },
  section: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  owner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    borderTop: '1px solid var(--ops-ink-100)',
    paddingTop: '1.5rem',
  },
  ownerFields: {
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      '@media (min-width: 768px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  hint: {
    margin: 0,
    fontSize: '0.78125rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
  host: {
    fontFamily: 'var(--font-family-code)',
    color: 'var(--color-text-primary)',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
    flexWrap: 'wrap',
    paddingTop: '1.5rem',
    borderTop: '1px solid var(--ops-ink-100)',
  },
});

export function NewGymForm({ rootDomain }: { rootDomain: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [gymName, setGymName] = useState('');
  const [subdomainSlug, setSubdomainSlug] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createGymRequestAction({
        gymName: gymName.trim(),
        subdomainSlug: subdomainSlug.trim().toLowerCase(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        ...(ownerName.trim() ? { ownerName: ownerName.trim() } : {}),
      });
      if (result.ok) {
        // The request detail exposes the link and tracks approval.
        router.push(`/requests/${result.data.id}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <div {...stylex.props(styles.section)}>
        <Cap>Gym</Cap>
        <TextInput
          label="Gym name"
          htmlName="gymName"
          size="lg"
          xstyle={styles.input}
          placeholder="Downtown Strength"
          value={gymName}
          onChange={setGymName}
          isRequired
          isDisabled={pending}
        />

        <div>
          <label className={css.slugLabel}>
            <span>
              Subdomain <span aria-hidden="true">*</span>
            </span>
            <span className={css.slugControl}>
              <input
                aria-label="Subdomain"
                name="subdomainSlug"
                placeholder="downtown"
                value={subdomainSlug}
                onChange={(event) => setSubdomainSlug(event.target.value)}
                aria-required="true"
                disabled={pending}
              />
              {rootDomain ? <span className={css.suffix}>.{rootDomain}</span> : null}
            </span>
          </label>
          <p {...stylex.props(styles.hint)}>
            {subdomainSlug && rootDomain ? (
              <>
                The gym will live at{' '}
                <span {...stylex.props(styles.host)}>
                  {subdomainSlug.trim().toLowerCase()}.{rootDomain}
                </span>
                . Lowercase letters, numbers and single hyphens; the subdomain is held for this
                request.
              </>
            ) : (
              'Lowercase letters, numbers and single hyphens. The subdomain becomes permanent on approval.'
            )}
          </p>
        </div>
      </div>
      <div {...stylex.props(styles.owner)}>
        <Cap>Owner</Cap>
        <div {...stylex.props(styles.ownerFields)}>
          <TextInput
            type="email"
            label="Owner email"
            htmlName="ownerEmail"
            size="lg"
            xstyle={styles.input}
            placeholder="owner@example.com"
            value={ownerEmail}
            onChange={setOwnerEmail}
            isRequired
            isDisabled={pending}
          />

          <TextInput
            label="Owner name"
            htmlName="ownerName"
            size="lg"
            xstyle={styles.input}
            placeholder="Optional"
            value={ownerName}
            onChange={setOwnerName}
            isDisabled={pending}
          />
        </div>
        <p {...stylex.props(styles.hint)}>
          The owner is emailed an onboarding link. The same link appears on the next screen, ready
          to copy and send by hand.
        </p>
      </div>

      <div {...stylex.props(styles.actions)}>
        <Button
          type="button"
          variant="ghost"
          size="card"
          label="Cancel"
          disabled={pending}
          onClick={() => router.push('/')}
        />
        <Button type="submit" variant="primary" size="card" label="Create link" loading={pending} />
      </div>
    </form>
  );
}
