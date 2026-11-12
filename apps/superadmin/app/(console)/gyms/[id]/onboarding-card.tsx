'use client';

import { type ReactNode, useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  GYM_ONBOARDING_STEPS,
  type AdminGymOnboarding,
  type GymOnboardingStep,
  type GymOnboardingStatus,
} from '@fit/types';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  type BadgeTone,
} from '@fit/ui-kit';
import { createOnboardingLinkAction } from '../../actions';

const STATUS: Record<GymOnboardingStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Not started', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'pending' },
  COMPLETED: { label: 'Completed', tone: 'positive' },
  EXPIRED: { label: 'Expired', tone: 'danger' },
};

const STEP_LABELS: Record<GymOnboardingStep, string> = {
  account: 'Owner account',
  business: 'Business details',
  brand: 'Brand colour',
  location: 'First location',
  payments: 'Payment methods',
};

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' },
  steps: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
    gap: '0.5rem',
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  linkField: {
    flexGrow: 1,
    minWidth: 0,
    padding: '0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '0.5rem',
    backgroundColor: 'transparent',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
  },
  link: { color: 'var(--color-text-accent)', textDecoration: 'none' },
  muted: { color: 'var(--color-text-secondary)', fontSize: '0.8125rem' },
});

export function OnboardingCard({
  gymId,
  slug,
  onboarding,
  url,
  children,
}: {
  gymId: string;
  slug: string;
  onboarding: AdminGymOnboarding | null;
  url: string | null;
  children?: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = url ?? onboarding?.token;

  function createLink() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const result = await createOnboardingLinkAction(gymId);
        if (!result.ok) setError(result.error);
      } catch {
        setError('Could not create the onboarding link. Please try again.');
      } finally {
        setConfirming(false);
      }
    });
  }

  async function copyLink() {
    if (!link) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the link or token above and copy it manually.');
    }
  }

  return (
    <Card>
      <div {...stylex.props(styles.stack)}>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {onboarding ? (
          <>
            <div {...stylex.props(styles.row)}>
              <Badge
                label={STATUS[onboarding.status].label}
                tone={STATUS[onboarding.status].tone}
              />
              <span {...stylex.props(styles.muted)}>
                {onboarding.completedSteps.length} of {onboarding.totalSteps} steps
              </span>
            </div>
            <ul {...stylex.props(styles.steps)} aria-label="Onboarding steps">
              {GYM_ONBOARDING_STEPS.map((step) => {
                const done = onboarding.completedSteps.includes(step);
                return (
                  <li key={step}>
                    <span aria-hidden="true">{done ? '✓' : '○'} </span>
                    {STEP_LABELS[step]}
                    <span {...stylex.props(styles.muted)}> — {done ? 'Done' : 'Not done'}</span>
                  </li>
                );
              })}
            </ul>
            {onboarding.status !== 'COMPLETED' && link ? (
              <>
                <div {...stylex.props(styles.row)}>
                  <input
                    aria-label={
                      url ? `Onboarding link for ${slug}` : `Onboarding token for ${slug}`
                    }
                    readOnly
                    value={link}
                    onFocus={(event) => event.currentTarget.select()}
                    {...stylex.props(styles.linkField)}
                  />
                  <Button
                    variant="secondary"
                    size="inline"
                    label={copied ? 'Copied' : 'Copy'}
                    disabled={pending}
                    onClick={() => void copyLink()}
                  />
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" {...stylex.props(styles.link)}>
                      Open ↗
                    </a>
                  ) : null}
                  <span role="status" {...stylex.props(styles.muted)}>
                    {copied ? 'Copied to clipboard' : ''}
                  </span>
                </div>
                {!url ? (
                  <Banner tone="info">
                    NEXT_PUBLIC_ROOT_DOMAIN is not set. Set it to build the onboarding URL. The raw
                    token is shown above.
                  </Banner>
                ) : null}
              </>
            ) : null}
            {children}
            {onboarding.status !== 'COMPLETED' ? (
              <div {...stylex.props(styles.row)}>
                <Button
                  variant="secondary"
                  size="card"
                  label="Regenerate link"
                  loading={pending}
                  onClick={() => setConfirming(true)}
                />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <EmptyState
              compact
              title="No onboarding link"
              body="Create a link so the owner can set up their account and gym settings."
            />
            <div {...stylex.props(styles.row)}>
              <Button
                variant="primary"
                size="card"
                label="Create onboarding link"
                loading={pending}
                onClick={createLink}
              />
            </div>
          </>
        )}
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          title={`Regenerate onboarding link for ${slug}?`}
          description="The old link will stop working immediately. Completed steps will be kept. Send the new link to the owner."
          cancelLabel="Cancel"
          confirmLabel="Regenerate link"
          confirmVariant="destructive"
          loading={pending}
          onConfirm={createLink}
        />
      </div>
    </Card>
  );
}
