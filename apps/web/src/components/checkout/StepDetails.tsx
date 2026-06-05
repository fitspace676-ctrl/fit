'use client';

import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { registerSchema, type OrderCustomer } from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { registerWithCredentials } from '@/lib/auth';
import { useSession } from '@/hooks/use-session';
import { CHECKOUT_LOCATION_KEY } from './StepLocation';
import { CHECKOUT_PACKAGE_KEY } from './StepPackage';

/** sessionStorage key the wizard persists the guest's contact details under (T3.10). */
export const CHECKOUT_CUSTOMER_KEY = 'checkout_customer';

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
    return <p className="py-16 text-center text-sm text-slate-400">{t('details.loading')}</p>;
  }

  if (user) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-900">{t('details.title')}</h2>
          <p className="text-sm text-slate-500">{t('details.subtitle')}</p>
        </div>

        <div className="flex items-start gap-3 rounded-card border border-brand-200 bg-brand-50 p-4">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm text-slate-700">{t('details.signedIn')}</p>
        </div>

        <div className="flex justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-card border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            {t('back')}
          </button>
          <button
            type="button"
            disabled={!gymId || !effectivePackageId}
            onClick={onContinueSignedIn}
            className="rounded-card bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {t('continue')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmitGuest} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">{t('details.title')}</h2>
        <p className="text-sm text-slate-500">{t('details.guestSubtitle')}</p>
      </div>

      {error ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <Field
          label={t('details.fields.name')}
          type="text"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={setName}
          disabled={pending}
        />
        <Field
          label={t('details.fields.email')}
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={setEmail}
          disabled={pending}
        />
        <Field
          label={t('details.fields.password')}
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint={t('details.fields.passwordHint')}
          value={password}
          onChange={setPassword}
          disabled={pending}
        />
      </div>

      <div className="flex justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="rounded-card border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {t('back')}
        </button>
        <button
          type="submit"
          disabled={pending || !gymId || !effectivePackageId}
          className="rounded-card bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {pending ? t('details.submitting') : t('continue')}
        </button>
      </div>
    </form>
  );
}

/** A labelled text input local to the details form (mirrors the auth TextField). */
function Field({
  label,
  hint,
  value,
  onChange,
  ...props
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
  name: string;
  autoComplete: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-left">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        {...props}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-card border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
      />
      {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}
