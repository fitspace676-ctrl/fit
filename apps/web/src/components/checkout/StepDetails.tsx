'use client';

import { type FormEvent, useCallback, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { registerSchema, type OrderCustomer } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { registerWithCredentials } from '@/lib/auth';
import { useSession } from '@/hooks/use-session';
import { Icon } from '@/src/components/ui';
import { CHECKOUT_LOCATION_KEY } from './StepLocation';
import { CHECKOUT_PACKAGE_KEY } from './StepPackage';

/** sessionStorage key the wizard persists the guest's contact details under (T3.10). */
export const CHECKOUT_CUSTOMER_KEY = 'checkout_customer';

// Astryx migration (T11.15): step 3 (who the order is for) is rebuilt on the Fit
// brand theme — the guest register form uses Astryx `TextInput` (mirroring the
// migrated register screen, T11.8) with Back / Continue on the Astryx `Button`;
// the signed-in confirmation panel, error banner and layout are compiled StyleX
// (`var(--color-*)`) — no Tailwind utilities. The register schema validation,
// best-effort account creation and navigation are unchanged.
const styles = stylex.create({
  status: {
    paddingBlock: '4rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  signedIn: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-accent-muted)',
    backgroundColor: 'var(--color-accent-muted)',
    padding: '1rem',
  },
  signedInIcon: {
    marginTop: '0.125rem',
    height: '1.25rem',
    width: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-text-accent)',
  },
  signedInText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  error: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
    backgroundColor: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-error) 30%, transparent)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    height: '1rem',
    width: '1rem',
    flexShrink: 0,
  },
  fields: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
});

/**
 * Read the guest contact details persisted in step 3, or `null` when none were
 * captured (a signed-in buyer, or step 3 was skipped). Tolerates a malformed /
 * legacy value by treating it as absent rather than throwing.
 */
export function readCheckoutCustomer(): OrderCustomer | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.sessionStorage.getItem(CHECKOUT_CUSTOMER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = registerSchema.pick({ name: true, email: true }).safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export interface StepDetailsProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
  /** `?locationId` from step 1 — preserved across Back / Continue. */
  locationId?: string;
  /** `?packageId` from step 2 — preserved across Back / Continue. */
  packageId?: string;
}

/**
 * Step 3 of the purchase wizard: who the order is for. A signed-in visitor sees
 * a confirmation panel and continues straight to payment; a guest fills an
 * inline registration form (name + email + password, validated against the
 * shared {@link registerSchema}). On Continue the guest's name + email are
 * persisted to `sessionStorage` so step 4 can attach them to the order, and an
 * account is created in the background (`POST /auth/register`) — registration
 * emails a verification link rather than issuing a session, so it never blocks
 * the checkout. Back returns to step 2 with the package preserved.
 */
export function StepDetails({ gymId, locationId, packageId }: StepDetailsProps) {
  const t = useTranslations('checkout');
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useSession();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The location/package may be missing from the URL on a direct refresh; fall
  // back to what the earlier steps persisted so the order stays intact.
  const effectiveLocationId = useMemo(() => {
    if (locationId) {
      return locationId;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }
    return window.sessionStorage.getItem(CHECKOUT_LOCATION_KEY) ?? undefined;
  }, [locationId]);

  const effectivePackageId = useMemo(() => {
    if (packageId) {
      return packageId;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }
    return window.sessionStorage.getItem(CHECKOUT_PACKAGE_KEY) ?? undefined;
  }, [packageId]);

  // Build a wizard URL for the given step, carrying the package + location so a
  // refresh / Back keeps the selection.
  const stepHref = useCallback(
    (step: '2' | '4') => {
      const params = new URLSearchParams({ step });
      if (effectivePackageId) {
        params.set('packageId', effectivePackageId);
      }
      if (effectiveLocationId) {
        params.set('locationId', effectiveLocationId);
      }
      return `${pathname}?${params.toString()}`;
    },
    [effectivePackageId, effectiveLocationId, pathname],
  );

  const onBack = useCallback(() => {
    router.push(stepHref('2'), { scroll: false });
  }, [router, stepHref]);

  // Signed-in buyer: nothing to capture, advance straight to payment.
  const onContinueSignedIn = useCallback(() => {
    router.push(stepHref('4'), { scroll: false });
  }, [router, stepHref]);

  // Guest: validate, persist contact details for the order, kick off account
  // creation (best-effort — a duplicate email shouldn't block checkout), then
  // advance to payment.
  const onSubmitGuest = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = registerSchema.safeParse({ name, email, password });
      if (!parsed.success) {
        setError(t('details.invalid'));
        return;
      }

      setPending(true);
      setError(null);

      const customer: OrderCustomer = { name: parsed.data.name, email: parsed.data.email };
      window.sessionStorage.setItem(CHECKOUT_CUSTOMER_KEY, JSON.stringify(customer));

      registerWithCredentials(parsed.data)
        .catch(() => {
          // An already-registered email (or any register hiccup) must not strand
          // the buyer — the order still carries their contact details. Swallow
          // and proceed; the account can be claimed later via email verification.
        })
        .finally(() => {
          router.push(stepHref('4'), { scroll: false });
        });
    },
    [name, email, password, t, router, stepHref],
  );

  if (isLoading) {
    return <p {...stylex.props(styles.status)}>{t('details.loading')}</p>;
  }

  if (user) {
    return (
      <div {...stylex.props(styles.root)}>
        <div {...stylex.props(styles.heading)}>
          <h2 {...stylex.props(styles.title)}>{t('details.title')}</h2>
          <p {...stylex.props(styles.subtitle)}>{t('details.subtitle')}</p>
        </div>

        <div {...stylex.props(styles.signedIn)}>
          <Icon name="check" {...stylex.props(styles.signedInIcon)} sw={2.4} />
          <p {...stylex.props(styles.signedInText)}>{t('details.signedIn')}</p>
        </div>

        <div {...stylex.props(styles.actions)}>
          <Button variant="secondary" size="md" label={t('back')} onClick={onBack} />
          <Button
            variant="primary"
            size="md"
            label={t('continue')}
            isDisabled={!gymId || !effectivePackageId}
            onClick={onContinueSignedIn}
          />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmitGuest} {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.heading)}>
        <h2 {...stylex.props(styles.title)}>{t('details.title')}</h2>
        <p {...stylex.props(styles.subtitle)}>{t('details.guestSubtitle')}</p>
      </div>

      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} sw={2.2} />
          {error}
        </p>
      ) : null}

      <div {...stylex.props(styles.fields)}>
        <TextInput
          type="text"
          label={t('details.fields.name')}
          htmlName="name"
          value={name}
          onChange={(value) => setName(value)}
          isRequired
          isDisabled={pending}
        />
        <TextInput
          type="email"
          label={t('details.fields.email')}
          htmlName="email"
          value={email}
          onChange={(value) => setEmail(value)}
          isRequired
          isDisabled={pending}
        />
        <TextInput
          type="password"
          label={t('details.fields.password')}
          htmlName="password"
          description={t('details.fields.passwordHint')}
          value={password}
          onChange={(value) => setPassword(value)}
          isRequired
          isDisabled={pending}
        />
      </div>

      <div {...stylex.props(styles.actions)}>
        <Button
          type="button"
          variant="secondary"
          size="md"
          label={t('back')}
          isDisabled={pending}
          onClick={onBack}
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          label={pending ? t('details.submitting') : t('continue')}
          isLoading={pending}
          isDisabled={pending || !gymId || !effectivePackageId}
        />
      </div>
    </form>
  );
}
