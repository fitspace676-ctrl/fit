'use client';

import { type FormEvent, useCallback, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Selector } from '@astryxdesign/core/Selector';
import {
  memberSignupSchema,
  orderCustomerSchema,
  type CheckoutProductType,
  type Gender,
  type OrderCustomer,
} from '@fit/types';
import { usePathname, useRouter } from '@/src/i18n/navigation';
import { EmailTakenError, signupMember } from '@/lib/signup';
import { useSession } from '@/hooks/use-session';
import { Icon } from '@/src/components/ui';
import { Link } from '@/src/i18n/navigation';
import { CHECKOUT_LOCATION_KEY } from './StepLocation';
import { CHECKOUT_PACKAGE_KEY, CHECKOUT_PRODUCT_TYPE_KEY } from './StepPackage';

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
  /**
   * The form in two named groups rather than one column of seven inputs.
   *
   * Seven stacked fields read as a wall — the buyer cannot see the end of it,
   * and nothing explains why a gym needs their date of birth or ID number.
   * Splitting into "about you" and "your login", each with a one-line reason,
   * turns an interrogation into two short, obvious asks.
   */
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
    borderWidth: 0,
    margin: 0,
    padding: 0,
  },
  groupHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    padding: 0,
  },
  groupTitle: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  groupHint: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  /** Two columns once there is room; one below, where side-by-side inputs cramp. */
  grid2: {
    display: 'grid',
    gap: '0.875rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 34rem)': 'repeat(2, minmax(0, 1fr))',
    },
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
    const result = orderCustomerSchema.safeParse(parsed);
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
  /** `?productType` from step 2 — preserved across Back / Continue. */
  productType?: CheckoutProductType;
}

/**
 * Step 3 of the purchase wizard: who is joining. A signed-in visitor sees a
 * confirmation panel and continues straight to payment; everyone else fills the
 * membership form — the account credentials plus the profile the front desk
 * needs on file (phone, date of birth, national id, gender) — validated against
 * the shared {@link memberSignupSchema} so the client and the API can never
 * drift on what is required.
 *
 * **Signing up here creates the session the next step runs on.** `POST
 * /auth/signup` creates the account *and* its gym membership and returns a live
 * session, so payment happens as the member rather than as an anonymous buyer —
 * which is what lets the API take the gym, the member and the price off the
 * session instead of trusting the wire. The address is still unverified: a
 * verification email goes out, and the member must click it before their *next*
 * sign-in.
 *
 * An already-registered email is the one failure treated as a branch rather than
 * an error: the step offers to sign in instead, keeping the buyer's place in the
 * flow rather than stranding them on a dead end. Back returns to step 2 with the
 * product preserved.
 */
export function StepDetails({ gymId, locationId, packageId, productType }: StepDetailsProps) {
  const t = useTranslations('checkout');
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useSession();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  // `DateInput` speaks a template-literal `YYYY-MM-DD`; empty means "not picked
  // yet", which the signup schema rejects the same way it rejects a bad date.
  const [dateOfBirth, setDateOfBirth] = useState<ISODateString | ''>('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [personalId, setPersonalId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when signup was refused because the address already has an account. */
  const [emailTaken, setEmailTaken] = useState(false);

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

  const effectiveProductType = useMemo(() => {
    if (productType) {
      return productType;
    }
    if (typeof window === 'undefined') {
      return undefined;
    }
    return (
      (window.sessionStorage.getItem(CHECKOUT_PRODUCT_TYPE_KEY) as CheckoutProductType) ?? undefined
    );
  }, [productType]);

  // Build a wizard URL for the given step, carrying the product (id *and* type)
  // plus the branch so a refresh / Back keeps the selection.
  const stepHref = useCallback(
    (step: '2' | '4') => {
      const params = new URLSearchParams({ step });
      if (effectivePackageId) {
        params.set('packageId', effectivePackageId);
      }
      if (effectiveProductType) {
        params.set('productType', effectiveProductType);
      }
      if (effectiveLocationId) {
        params.set('locationId', effectiveLocationId);
      }
      return `${pathname}?${params.toString()}`;
    },
    [effectivePackageId, effectiveProductType, effectiveLocationId, pathname],
  );

  const onBack = useCallback(() => {
    router.push(stepHref('2'), { scroll: false });
  }, [router, stepHref]);

  // Signed-in buyer: nothing to capture, advance straight to payment.
  const onContinueSignedIn = useCallback(() => {
    router.push(stepHref('4'), { scroll: false });
  }, [router, stepHref]);

  /**
   * New member: validate against the shared signup contract, create the account
   * + membership, and advance to payment already signed in.
   *
   * Unlike the previous guest flow, signup is **not** best-effort: the payment
   * step needs the session it returns, so a failure keeps the buyer on this step
   * with the reason rather than sending them to a checkout that would 401. The
   * one exception is an address that already has an account, which becomes a
   * "sign in instead" prompt.
   */
  const onSubmitGuest = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!gymId) {
        setError(t('details.invalid'));
        return;
      }

      const parsed = memberSignupSchema.safeParse({
        gymId,
        name,
        email,
        password,
        phone,
        dateOfBirth,
        gender,
        personalId,
      });
      if (!parsed.success) {
        setError(t('details.invalid'));
        return;
      }

      setPending(true);
      setError(null);
      setEmailTaken(false);

      // Kept for the order's contact details, which the confirmation reads back.
      const customer: OrderCustomer = { name: parsed.data.name, email: parsed.data.email };
      window.sessionStorage.setItem(CHECKOUT_CUSTOMER_KEY, JSON.stringify(customer));

      signupMember(parsed.data)
        .then(() => {
          router.push(stepHref('4'), { scroll: false });
        })
        .catch((err: unknown) => {
          setPending(false);
          if (err instanceof EmailTakenError) {
            setEmailTaken(true);
            return;
          }
          setError(err instanceof Error ? err.message : t('details.invalid'));
        });
    },
    [gymId, name, email, password, phone, dateOfBirth, gender, personalId, t, router, stepHref],
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

      {emailTaken ? (
        <p role="alert" {...stylex.props(styles.error)}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} sw={2.2} />
          {t('details.emailTaken')}{' '}
          <Link href={`/login?from=${encodeURIComponent(stepHref('4'))}`}>
            {t('details.emailTakenAction')}
          </Link>
        </p>
      ) : null}

      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} sw={2.2} />
          {error}
        </p>
      ) : null}

      <div {...stylex.props(styles.fields)}>
        <fieldset {...stylex.props(styles.group)}>
          <legend {...stylex.props(styles.groupHead)}>
            <span {...stylex.props(styles.groupTitle)}>{t('details.groups.about.title')}</span>
            <span {...stylex.props(styles.groupHint)}>{t('details.groups.about.hint')}</span>
          </legend>

          <TextInput
            type="text"
            label={t('details.fields.name')}
            htmlName="name"
            value={name}
            onChange={(value) => setName(value)}
            isRequired
            isDisabled={pending}
          />

          <div {...stylex.props(styles.grid2)}>
            <TextInput
              type="text"
              label={t('details.fields.phone')}
              htmlName="phone"
              value={phone}
              onChange={(value) => setPhone(value)}
              isRequired
              isDisabled={pending}
            />
            {/*
              `DateInput` emits an ISO `YYYY-MM-DD` string — exactly what the
              signup contract expects — so there is no parse or timezone step
              between the picker and the wire.
            */}
            <DateInput
              label={t('details.fields.dateOfBirth')}
              value={dateOfBirth ? dateOfBirth : undefined}
              onChange={(value) => setDateOfBirth(value ?? '')}
              isRequired
              isDisabled={pending}
            />
          </div>

          <div {...stylex.props(styles.grid2)}>
            <TextInput
              type="text"
              label={t('details.fields.personalId')}
              htmlName="personalId"
              description={t('details.fields.personalIdHint')}
              value={personalId}
              onChange={(value) => setPersonalId(value)}
              isRequired
              isDisabled={pending}
            />
            <Selector
              label={t('details.fields.gender')}
              value={gender}
              onChange={(value) => setGender(value as Gender)}
              options={[
                { value: 'FEMALE', label: t('details.gender.female') },
                { value: 'MALE', label: t('details.gender.male') },
                { value: 'OTHER', label: t('details.gender.other') },
              ]}
              isRequired
              isDisabled={pending}
            />
          </div>
        </fieldset>

        <fieldset {...stylex.props(styles.group)}>
          <legend {...stylex.props(styles.groupHead)}>
            <span {...stylex.props(styles.groupTitle)}>{t('details.groups.account.title')}</span>
            <span {...stylex.props(styles.groupHint)}>{t('details.groups.account.hint')}</span>
          </legend>

          <div {...stylex.props(styles.grid2)}>
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
        </fieldset>
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
