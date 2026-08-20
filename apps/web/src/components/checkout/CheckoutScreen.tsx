'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { createNumberFormat } from '@fit/i18n';
import {
  memberSignupSchemaFor,
  type CheckoutProductType,
  type Gender,
  type PackageSummary,
  type SignupCatalogueResponse,
} from '@fit/types';
import { useRouter } from '@/src/i18n/navigation';
import { createCheckout, EmailTakenError, fetchSignupCatalogue, signupMember } from '@/lib/signup';
import { useSession } from '@/hooks/use-session';
import { Icon } from '@/src/components/ui';
import { Link } from '@/src/i18n/navigation';
import { Banner, DateField, Field } from '@/src/components/ui/kit';
import { PRODUCT_TABS, toCards } from './product-cards';

// FormaCore redesign — the purchase flow as ONE page.
//
// It replaced a four-step wizard (`?step=1..4`, one client island per step, the
// selection carried in the URL and sessionStorage). The artboard puts the whole
// purchase on a single screen — three numbered sections down the left, a sticky
// lime order block on the right — and that is the better shape for what is
// actually being bought: three or four choices, most of them one click, with a
// running total the buyer can see the whole time. A wizard hid the total behind
// a "next" button and made the price the last thing anyone saw.
//
// WHAT THE REBUILD HAD TO PRESERVE, and does:
//
//   • The ORDER of operations. `POST /checkout` runs as the member, so a
//     signed-out buyer must be registered first. On the wizard that was step 3
//     finishing before step 4 existed; here the pay button does the two calls in
//     sequence, and a failed signup never reaches the charge.
//   • The location step is folded into section 01 rather than dropped: a
//     single-branch gym never sees it (the artboard's gym has one floor), a
//     multi-branch one picks a chip.
//   • The honesty of the payment step. `payment.notice` says online payment is
//     not live yet — the membership is reserved and settled at reception — so
//     this screen shows no card fields. The artboard draws them; drawing a card
//     form that charges nothing would be the one thing worse than not having one.

const styles = stylex.create({
  page: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '1180px',
    paddingInline: { default: '1.5rem', '@media (min-width: 1024px)': '2.5rem' },
    paddingBlock: { default: '2.5rem', '@media (min-width: 1024px)': '3.5rem' },
  },

  /* ---------------------------------- head --------------------------------- */
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1.5rem',
  },
  eyebrow: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.18em',
    color: 'var(--color-text-secondary)',
  },
  title: {
    margin: 0,
    marginTop: '0.75rem',
    maxWidth: '20ch',
    fontFamily: 'var(--font-family-heading)',
    fontSize: { default: '2.25rem', '@media (min-width: 640px)': '2.875rem' },
    fontWeight: 800,
    lineHeight: 1.02,
    letterSpacing: '-0.03em',
    color: 'var(--color-text-primary)',
  },
  titleAccent: { color: 'var(--color-text-accent)' },
  steps: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  stepNum: {
    display: 'grid',
    placeItems: 'center',
    height: '1.5rem',
    width: '1.5rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--fc-quiet)',
    color: 'var(--fc-on-quiet)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 700,
  },
  stepNumDone: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  stepRule: {
    height: '1px',
    width: '1.5rem',
    backgroundColor: 'var(--color-border)',
  },
  stepBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transitionProperty: 'color',
    transitionDuration: '150ms',
    ':disabled': { cursor: 'default' },
  },
  stepBtnOn: {
    color: 'var(--color-text-primary)',
  },

  /* --------------------------------- layout -------------------------------- */
  layout: {
    marginTop: '2.5rem',
    display: 'grid',
    alignItems: 'start',
    gap: '1.5rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'minmax(0, 1fr) 22rem',
    },
  },
  column: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    gap: '2.5rem',
  },

  /* -------------------------------- sections ------------------------------- */
  sectionBody: { marginTop: '1.25rem' },
  hint: {
    margin: 0,
    marginBottom: '1rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },

  /* --------------------------------- chips --------------------------------- */
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  chip: {
    display: 'inline-flex',
    height: '2.5rem',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingInline: '1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: '150ms',
  },
  chipIdle: {
    borderColor: 'var(--color-border)',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: 'var(--color-text-secondary)',
  },
  chipOn: {
    borderColor: 'transparent',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },

  /* ------------------------------- locations ------------------------------- */
  // A branch is a PLACE, so the card leads with the picture of it and puts the
  // address directly under the name: the two things someone deciding where to
  // train actually weighs. It replaced a row of name-only chips, which asked a
  // buyer to know the branch names by heart.
  locationGrid: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  locationCard: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-card)',
    padding: 0,
    textAlign: 'start',
    cursor: 'pointer',
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
  },
  locationThumb: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: '16 / 9',
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'var(--color-background-muted)',
  },
  locationImg: {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
  },
  // Same placeholder grammar as the shop: the branch's initial, not one map pin
  // repeated down the whole list.
  locationInitial: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.875rem',
    fontWeight: 700,
    lineHeight: 1,
    color: 'var(--color-text-secondary)',
  },
  locationBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '1rem',
  },
  locationName: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  locationAddress: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.375rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  locationPin: {
    marginTop: '0.125rem',
    flexShrink: 0,
    height: '0.875rem',
    width: '0.875rem',
    color: 'var(--color-text-accent)',
  },

  /* --------------------------------- cards --------------------------------- */
  cardGrid: {
    marginTop: '1rem',
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-card)',
    padding: '1.25rem',
    textAlign: 'start',
    cursor: 'pointer',
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
  },
  // The chosen product is marked by a lime rule, not a fill: the block colour
  // belongs to the order rail, and two limes competing across the page would
  // make the buyer look twice to find the total.
  cardOn: {
    borderColor: 'var(--color-accent)',
    boxShadow: 'inset 0 0 0 1px var(--color-accent)',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  cardName: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  cardPrice: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.125rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
  },
  cardCadence: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  cardDesc: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
  cardFeatures: {
    margin: 0,
    marginTop: '0.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    padding: 0,
    listStyle: 'none',
  },
  cardFeature: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  featureIcon: {
    marginTop: '0.1875rem',
    flexShrink: 0,
    height: '0.8125rem',
    width: '0.8125rem',
    color: 'var(--color-text-accent)',
  },
  popular: {
    alignSelf: 'flex-start',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    paddingInline: '0.625rem',
    paddingBlock: '0.125rem',
    fontSize: '0.625rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },

  /* ------------------------------ free account ----------------------------- */
  // Set apart from the paid cards rather than mixed into their grid: it is not a
  // cheaper plan, it is the choice not to buy one — and a "0,00 ₾" card sitting
  // beside Premium reads as the former.
  freeWrap: {
    marginTop: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  freeOr: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--color-text-secondary)',
  },
  // The offer sits on the SAME surface as the plan cards — white in light, the
  // card fill in dark — so the only thing setting it apart is the dashed rule.
  // It buys nothing; it should not also look like a different kind of object.
  freeCard: {
    borderStyle: 'dashed',
  },
  freePrice: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    color: 'var(--color-text-accent)',
  },

  /* --------------------------------- fields -------------------------------- */
  fieldGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  fieldWide: {
    gridColumn: { default: 'auto', '@media (min-width: 640px)': '1 / -1' },
  },
  fieldLabel: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: 'var(--color-text-secondary)',
  },
  signedIn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-tile)',
    padding: '1rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  signedInIcon: {
    flexShrink: 0,
    height: '1rem',
    width: '1rem',
    color: 'var(--color-text-accent)',
  },

  /* --------------------------------- terms --------------------------------- */
  terms: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    cursor: 'pointer',
    textAlign: 'start',
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
  },
  box: {
    display: 'grid',
    placeItems: 'center',
    marginTop: '0.0625rem',
    height: '1.25rem',
    width: '1.25rem',
    flexShrink: 0,
    borderRadius: '0.375rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'transparent',
    transitionProperty: 'background-color, border-color',
    transitionDuration: '150ms',
  },
  boxOn: {
    borderColor: 'transparent',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  boxIcon: { height: '0.75rem', width: '0.75rem' },
  termsText: {
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
  notice: {
    margin: 0,
    marginTop: '1rem',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-tile)',
    padding: '1rem',
    fontSize: '0.8125rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
  noticeIcon: {
    marginTop: '0.125rem',
    flexShrink: 0,
    height: '0.875rem',
    width: '0.875rem',
  },

  /* ------------------------------- order rail ------------------------------ */
  rail: {
    position: { default: 'static', '@media (min-width: 1024px)': 'sticky' },
    top: '2rem',
  },
  // THE lime block, and the only one on the page: what you are buying and what
  // it costs, in view the whole time.
  order: {
    borderRadius: 'var(--radius-page)',
    backgroundColor: 'var(--color-accent)',
    color: '#131312',
    padding: '1.75rem',
  },
  orderEyebrow: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: '#2B2B29',
  },
  orderName: {
    margin: 0,
    marginTop: '0.875rem',
    color: '#131312',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.75rem',
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: '-0.025em',
  },
  orderMeta: {
    margin: 0,
    marginTop: '0.5rem',
    color: '#2B2B29',
    fontSize: '0.8125rem',
    fontWeight: 500,
  },
  orderRule: {
    marginBlock: '1.25rem',
    height: '1px',
    backgroundColor: 'rgba(19, 19, 18, 0.15)',
  },
  totalLabel: {
    margin: 0,
    color: '#2B2B29',
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
  },
  // The signature numeral: the price is the largest thing in the rail.
  totalValue: {
    margin: 0,
    marginTop: '0.375rem',
    color: '#131312',
    fontFamily: 'var(--font-family-code)',
    fontSize: '2.5rem',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.04em',
    fontVariantNumeric: 'tabular-nums',
  },
  pay: {
    display: 'flex',
    height: '3.25rem',
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: 0,
    backgroundColor: { default: '#131312', ':hover': '#2B2B29' },
    color: '#FFFFFF',
    fontSize: '0.9375rem',
    fontWeight: 700,
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  payOff: {
    backgroundColor: 'rgba(19, 19, 18, 0.25)',
    color: 'rgba(19, 19, 18, 0.55)',
    cursor: 'not-allowed',
  },
  payIcon: { height: '1rem', width: '1rem' },
  actionsRow: {
    marginTop: '1.5rem',
    display: 'flex',
    alignItems: 'stretch',
    gap: '0.5rem',
  },
  back: {
    display: 'flex',
    height: '3.25rem',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: 0,
    paddingInline: '1rem',
    backgroundColor: {
      default: 'rgba(19, 19, 18, 0.10)',
      ':hover': 'rgba(19, 19, 18, 0.18)',
    },
    color: '#2B2B29',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  orderNote: {
    margin: 0,
    marginTop: '1rem',
    color: '#2B2B29',
    fontSize: '0.75rem',
    lineHeight: 1.6,
  },
  orderEmpty: {
    margin: 0,
    marginTop: '0.875rem',
    color: '#2B2B29',
    fontSize: '0.875rem',
    lineHeight: 1.6,
  },
  railError: { marginTop: '1rem' },
});

export interface CheckoutScreenProps {
  /** The tenant the purchase is made on, resolved from the Host. */
  gymId: string | null;
  locale: string;
}

type Status = 'loading' | 'ready' | 'error';

/**
 * The four steps, in the order a purchase is actually decided: WHERE you will
 * train, WHAT you are buying, WHO you are, and then paying for it. Branch comes
 * first because it scopes the catalogue — a location-scoped price list can differ
 * per branch, so choosing the product before the branch could re-price what the
 * buyer already picked.
 */
/**
 * The `productId` that means "no product" — the gym's free account.
 *
 * A sentinel rather than a fourth product type: a free account buys nothing, so
 * there is no catalogue row to point at and `POST /checkout` is never called for
 * it. Carrying it in the same state as a real selection is what lets the step
 * chips, the order rail and the submit button stay one code path instead of two.
 */
const FREE_ACCOUNT_ID = '__free_account__';

const SECTIONS = ['location', 'package', 'details', 'payment'] as const;

type Step = 0 | 1 | 2 | 3;

/**
 * The heading for each step. It replaces a static "Checkout" over a numbered
 * section heading that repeated it — two headings saying the same thing, and
 * neither of them telling the buyer what they were being asked for right now.
 * The step number moved to the eyebrow, where the chips already echo it.
 */
const STEP_TITLES = [
  'locations.title',
  'packages.title',
  'details.title',
  'payment.title',
] as const;

/**
 * The public purchase screen: choose a branch and a product, say who you are,
 * and reserve the membership — all on one page, with the running order kept in
 * view. Reachable signed-out; a guest is registered as part of paying.
 */
export function CheckoutScreen({ gymId, locale }: CheckoutScreenProps) {
  const t = useTranslations('checkout');
  const tAuth = useTranslations('auth');
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();
  const signedIn = Boolean(user);

  const [catalogue, setCatalogue] = useState<SignupCatalogueResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const [locationId, setLocationId] = useState<string | undefined>();
  const [productType, setProductType] = useState<CheckoutProductType>('subscription');
  const [productId, setProductId] = useState<string | undefined>();

  // Collected as two fields but sent as one: `memberSignupSchema` takes a single
  // `name`, and splitting a joined string server-side guesses wrong on Georgian
  // compound surnames. Asking twice and joining once keeps the guess out of it.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [personalId, setPersonalId] = useState('');

  // The purchase is presented as three steps, but the STATE is one object: the
  // buyer can jump back to a finished step without anything being re-fetched or
  // re-entered, and the order rail reads the same selection at every step.
  const [step, setStep] = useState<Step>(0);
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  // One round trip backs the whole page. It is re-run when the branch changes,
  // because a location-scoped catalogue can price differently per branch.
  useEffect(() => {
    if (!gymId) {
      setStatus('error');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    fetchSignupCatalogue({ gymId, locationId, signal: controller.signal })
      .then((next) => {
        setCatalogue(next);
        setStatus('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [gymId, locationId]);

  // A gym with one branch has no choice to make: preselect it so step 01 reads
  // as a confirmation rather than asking for a click that has one answer. Only
  // ever fills an EMPTY selection, so it cannot fight the buyer's own pick.
  useEffect(() => {
    const only = catalogue?.locations.length === 1 ? catalogue.locations[0] : undefined;
    if (only && !locationId) {
      setLocationId(only.id);
    }
  }, [catalogue, locationId]);

  const cards = useMemo(
    () => (catalogue ? toCards(catalogue, productType) : []),
    [catalogue, productType],
  );
  const product = useMemo(
    () => cards.find((card) => card.id === productId) ?? null,
    [cards, productId],
  );
  const locationName = useMemo(
    () => catalogue?.locations.find((l) => l.id === locationId)?.name ?? null,
    [catalogue, locationId],
  );

  // The gym's free-account offer, if it runs one. Only ever shown to a visitor
  // with no account: it is a way IN, and a signed-in member already has the one
  // thing it grants. Both strings are the gym's own wording, blank meaning "use
  // the portal's".
  const freeOffered = Boolean(catalogue?.freeAccount.enabled) && !signedIn;
  const isFree = freeOffered && productId === FREE_ACCOUNT_ID;
  const freeName = catalogue?.freeAccount.name.trim() || t('packages.free.name');
  const freeDescription =
    catalogue?.freeAccount.description.trim() || t('packages.free.description');

  const money = useCallback(
    (minor: number, currency: string) =>
      createNumberFormat(locale, { style: 'currency', currency }).format(minor / 100),
    [locale],
  );

  const cadenceOf = (card: PackageSummary): string | null =>
    card.interval === 'month'
      ? t('packages.perMonth')
      : card.interval === 'year'
        ? t('packages.perYear')
        : null;

  const name = `${firstName.trim()} ${lastName.trim()}`.trim();

  // Which profile fields this gym asks for (Settings → Membership). Until the
  // catalogue lands, ask for nothing beyond the account itself rather than
  // guessing: a field that flickers in and out as the response arrives is worse
  // than one that appears once.
  const intake = catalogue?.memberIntake ?? null;
  const asks = useCallback(
    (field: keyof NonNullable<typeof intake>): boolean => Boolean(intake?.[field]),
    [intake],
  );

  /**
   * The signup body, from the fields this gym collects. A field it does not ask
   * for is OMITTED rather than sent empty — the member has no phone on file,
   * which is a different thing from a blank one.
   */
  const signupBody = useMemo(
    () => ({
      gymId: gymId ?? '',
      name,
      email,
      password,
      ...(asks('phone') ? { phone } : {}),
      ...(asks('dateOfBirth') ? { dateOfBirth } : {}),
      ...(asks('gender') ? { gender } : {}),
      ...(asks('personalId') ? { personalId } : {}),
    }),
    [gymId, name, email, password, asks, phone, dateOfBirth, gender, personalId],
  );

  /** Everything the details step needs before the purchase can be attempted. */
  const detailsReady =
    signedIn || (intake !== null && memberSignupSchemaFor(intake).safeParse(signupBody).success);

  const canPay = Boolean(gymId && (product || isFree) && terms && detailsReady) && !submitting;

  /**
   * Reserve the membership.
   *
   * A signed-out buyer is REGISTERED FIRST and only then charged: `POST
   * /checkout` runs as the member, so the account has to exist and the session
   * has to be live before the second call. A failed signup returns early — it
   * never falls through to the charge — and an already-registered email is
   * surfaced as a branch ("sign in instead") rather than a dead end.
   */
  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!gymId || (!product && !isFree) || !terms || submitting) return;

      setSubmitting(true);
      setError(null);
      setEmailTaken(false);

      const settle = (): Promise<void> => {
        // A free account has nothing to settle: the signup that just ran IS the
        // membership, so there is no order to place and no receipt to show.
        if (!product) {
          router.replace('/member/home', { scroll: false });
          return Promise.resolve();
        }
        return createCheckout({
          productType,
          productId: product.id,
          ...(locationId ? { locationId } : {}),
        }).then(({ orderId }) => {
          // Replace (not push) so Back from the confirmation cannot resubmit.
          router.replace(
            orderId
              ? `/member/checkout/success?orderId=${encodeURIComponent(orderId)}`
              : '/member/account/membership',
            { scroll: false },
          );
        });
      };

      const run = signedIn
        ? settle()
        : (() => {
            const parsed = intake ? memberSignupSchemaFor(intake).safeParse(signupBody) : null;
            if (!parsed?.success) {
              return Promise.reject(new Error(t('details.invalid')));
            }
            return signupMember(parsed.data).then(settle);
          })();

      run.catch((err: unknown) => {
        setSubmitting(false);
        if (err instanceof EmailTakenError) {
          setEmailTaken(true);
          return;
        }
        setError(err instanceof Error ? err.message : t('payment.error'));
      });
    },
    [
      gymId,
      product,
      isFree,
      terms,
      submitting,
      signedIn,
      productType,
      locationId,
      intake,
      signupBody,
      router,
      t,
    ],
  );

  const done: readonly boolean[] = [
    Boolean(locationId),
    Boolean(product) || isFree,
    detailsReady,
    terms,
  ];
  /** A step is reachable once every step before it is satisfied. */
  const reachable = (i: number): boolean => done.slice(0, i).every(Boolean);
  const canAdvance = done[step] === true;

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.head)}>
        <div>
          <p {...stylex.props(styles.eyebrow)}>
            {t('progress', { current: step + 1, total: SECTIONS.length })}
          </p>
          <h1 {...stylex.props(styles.title)}>{t(STEP_TITLES[step])}</h1>
        </div>

        {/* The chips are navigation, not decoration: a finished step can be
            reopened from here, which is the whole reason to keep the selection
            in one state object rather than per-step islands. */}
        <div {...stylex.props(styles.steps)}>
          {SECTIONS.map((key, i) => (
            <div key={key} {...stylex.props(styles.step)}>
              <button
                type="button"
                onClick={() => reachable(i) && setStep(i as Step)}
                disabled={!reachable(i)}
                aria-current={step === i ? 'step' : undefined}
                {...stylex.props(styles.stepBtn, step === i && styles.stepBtnOn)}
              >
                <span
                  {...stylex.props(styles.stepNum, (done[i] || step === i) && styles.stepNumDone)}
                >
                  {i + 1}
                </span>
                {t(`steps.${key}`)}
              </button>
              {i < SECTIONS.length - 1 ? <span {...stylex.props(styles.stepRule)} /> : null}
            </div>
          ))}
        </div>
      </div>

      <div {...stylex.props(styles.layout)}>
        <div {...stylex.props(styles.column)}>
          {/* ---------------------------- 01 location ---------------------------- */}
          <section hidden={step !== 0}>
            <div {...stylex.props(styles.sectionBody)}>
              <p {...stylex.props(styles.hint)}>{t('locations.subtitle')}</p>

              {status === 'loading' ? (
                <p {...stylex.props(styles.hint)}>{t('locations.loading')}</p>
              ) : status === 'error' ? (
                <p {...stylex.props(styles.hint)}>
                  {gymId ? t('locations.error') : t('packages.noGym')}
                </p>
              ) : (catalogue?.locations.length ?? 0) === 0 ? (
                <p {...stylex.props(styles.hint)}>{t('locations.empty.subtitle')}</p>
              ) : (
                <div {...stylex.props(styles.locationGrid)}>
                  {catalogue?.locations.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setLocationId(l.id);
                        // The catalogue is refetched scoped to the branch, and a
                        // product id from another branch may not exist in it.
                        setProductId(undefined);
                      }}
                      aria-pressed={locationId === l.id}
                      {...stylex.props(styles.locationCard, locationId === l.id && styles.cardOn)}
                    >
                      <span {...stylex.props(styles.locationThumb)}>
                        {l.photoUrl ? (
                          <img src={l.photoUrl} alt="" {...stylex.props(styles.locationImg)} />
                        ) : (
                          <span aria-hidden {...stylex.props(styles.locationInitial)}>
                            {l.name.trim().charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span {...stylex.props(styles.locationBody)}>
                        <span {...stylex.props(styles.locationName)}>{l.name}</span>
                        {l.address.trim() ? (
                          <span {...stylex.props(styles.locationAddress)}>
                            <Icon name="pin" sw={2} {...stylex.props(styles.locationPin)} />
                            {l.address}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ----------------------------- 02 package ---------------------------- */}
          <section hidden={step !== 1}>
            <div {...stylex.props(styles.sectionBody)}>
              <div {...stylex.props(styles.chipRow)}>
                {PRODUCT_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setProductType(tab);
                      setProductId(undefined);
                    }}
                    aria-pressed={productType === tab}
                    {...stylex.props(
                      styles.chip,
                      productType === tab ? styles.chipOn : styles.chipIdle,
                    )}
                  >
                    {t(`packages.tabs.${tab}`)}
                  </button>
                ))}
              </div>

              {status === 'loading' ? (
                <p {...stylex.props(styles.hint, styles.sectionBody)}>{t('packages.loading')}</p>
              ) : status === 'error' ? (
                <p {...stylex.props(styles.hint, styles.sectionBody)}>
                  {gymId ? t('packages.error') : t('packages.noGym')}
                </p>
              ) : cards.length === 0 ? (
                <p {...stylex.props(styles.hint, styles.sectionBody)}>{t('packages.tabEmpty')}</p>
              ) : (
                <div {...stylex.props(styles.cardGrid)}>
                  {cards.map((card) => {
                    const on = card.id === productId;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => setProductId(card.id)}
                        aria-pressed={on}
                        {...stylex.props(styles.card, on && styles.cardOn)}
                      >
                        {card.popular ? (
                          <span {...stylex.props(styles.popular)}>{t('packages.popular')}</span>
                        ) : null}
                        <div {...stylex.props(styles.cardTop)}>
                          <p {...stylex.props(styles.cardName)}>{card.name}</p>
                          <p {...stylex.props(styles.cardPrice)}>
                            {money(card.priceAmount, card.currency)}
                            {cadenceOf(card) ? (
                              <span {...stylex.props(styles.cardCadence)}> {cadenceOf(card)}</span>
                            ) : null}
                          </p>
                        </div>
                        {card.description ? (
                          <p {...stylex.props(styles.cardDesc)}>{card.description}</p>
                        ) : null}
                        {card.features.length > 0 ? (
                          <ul {...stylex.props(styles.cardFeatures)}>
                            {card.features.slice(0, 3).map((feature) => (
                              <li key={feature} {...stylex.props(styles.cardFeature)}>
                                <Icon name="check" sw={2.6} {...stylex.props(styles.featureIcon)} />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}

              {freeOffered ? (
                <div {...stylex.props(styles.freeWrap)}>
                  <span {...stylex.props(styles.freeOr)}>{t('packages.free.or')}</span>
                  <button
                    type="button"
                    onClick={() => setProductId(FREE_ACCOUNT_ID)}
                    aria-pressed={isFree}
                    {...stylex.props(styles.card, styles.freeCard, isFree && styles.cardOn)}
                  >
                    <div {...stylex.props(styles.cardTop)}>
                      <p {...stylex.props(styles.cardName)}>{freeName}</p>
                      <p {...stylex.props(styles.freePrice)}>{t('packages.free.price')}</p>
                    </div>
                    <p {...stylex.props(styles.cardDesc)}>{freeDescription}</p>
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          {/* ----------------------------- 02 details ---------------------------- */}
          <section hidden={step !== 2}>
            <div {...stylex.props(styles.sectionBody)}>
              {sessionLoading ? (
                <p {...stylex.props(styles.hint)}>{t('details.loading')}</p>
              ) : signedIn ? (
                <p {...stylex.props(styles.signedIn)}>
                  <Icon name="check" sw={2.6} {...stylex.props(styles.signedInIcon)} />
                  {t('details.signedIn')}
                </p>
              ) : (
                <>
                  <p {...stylex.props(styles.hint)}>{t('details.guestSubtitle')}</p>

                  {emailTaken ? (
                    <Banner tone="error">
                      {t('details.emailTaken')}{' '}
                      <Link href="/member/login">{t('details.emailTakenAction')}</Link>
                    </Banner>
                  ) : null}

                  <div {...stylex.props(styles.fieldGrid)}>
                    <Field
                      label={t('details.fields.firstName')}
                      name="given-name"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={submitting}
                    />
                    {/* Every field below the account itself is the gym's call —
                        Settings → Membership. A switched-off field is not shown at
                        all (and not sent), which is the same "on means shown and
                        required" rule the staff console's Add-Member drawer obeys. */}
                    {asks('surname') ? (
                      <Field
                        label={t('details.fields.lastName')}
                        name="family-name"
                        autoComplete="family-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        disabled={submitting}
                      />
                    ) : null}
                    <Field
                      label={t('details.fields.email')}
                      type="email"
                      name="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={submitting}
                      invalid={emailTaken}
                    />
                    <Field
                      label={t('details.fields.password')}
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      hint={t('details.fields.passwordHint')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                      revealLabels={{ show: tAuth('showPassword'), hide: tAuth('hidePassword') }}
                    />
                    {asks('phone') ? (
                      <Field
                        label={t('details.fields.phone')}
                        type="tel"
                        name="phone"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={submitting}
                      />
                    ) : null}
                    {/* The kit's own calendar rather than `<input type="date">`:
                        the native control draws an American month-first date
                        under a Georgian label and paints a picker no theme can
                        reach. The value it hands back is the same ISO string. */}
                    {asks('dateOfBirth') ? (
                      <DateField
                        label={t('details.fields.dateOfBirth')}
                        name="dateOfBirth"
                        value={dateOfBirth}
                        onChange={setDateOfBirth}
                        locale={locale}
                        placeholder={t('details.fields.datePlaceholder')}
                        labels={{
                          open: t('details.calendar.open'),
                          previousMonth: t('details.calendar.previousMonth'),
                          nextMonth: t('details.calendar.nextMonth'),
                          chooseYear: t('details.calendar.chooseYear'),
                        }}
                        disabled={submitting}
                      />
                    ) : null}
                    {asks('personalId') ? (
                      <Field
                        label={t('details.fields.personalId')}
                        name="personalId"
                        hint={t('details.fields.personalIdHint')}
                        value={personalId}
                        onChange={(e) => setPersonalId(e.target.value)}
                        disabled={submitting}
                      />
                    ) : null}
                    {/* Three options, so chips rather than a select: the whole
                        choice is visible and it is one tap on a phone. */}
                    <div {...stylex.props(styles.fieldWide)} hidden={!asks('gender')}>
                      <span {...stylex.props(styles.fieldLabel)}>{t('details.fields.gender')}</span>
                      <div {...stylex.props(styles.chipRow)}>
                        {(['FEMALE', 'MALE', 'OTHER'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setGender(value)}
                            aria-pressed={gender === value}
                            disabled={submitting}
                            {...stylex.props(
                              styles.chip,
                              gender === value ? styles.chipOn : styles.chipIdle,
                            )}
                          >
                            {t(`details.gender.${value.toLowerCase()}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ----------------------------- 03 payment ---------------------------- */}
          <section hidden={step !== 3}>
            <div {...stylex.props(styles.sectionBody)}>
              <button
                type="button"
                role="switch"
                aria-checked={terms}
                onClick={() => setTerms((v) => !v)}
                {...stylex.props(styles.terms)}
              >
                <span {...stylex.props(styles.box, terms && styles.boxOn)}>
                  {terms ? <Icon name="check" sw={3} {...stylex.props(styles.boxIcon)} /> : null}
                </span>
                <span {...stylex.props(styles.termsText)}>{t('payment.terms')}</span>
              </button>

              <p {...stylex.props(styles.notice)}>
                <Icon name="info" sw={2} {...stylex.props(styles.noticeIcon)} />
                {isFree ? t('payment.freeNotice') : t('payment.notice')}
              </p>
            </div>
          </section>
        </div>

        {/* ------------------------------ order rail ----------------------------- */}
        <div {...stylex.props(styles.rail)}>
          <div {...stylex.props(styles.order)}>
            <p {...stylex.props(styles.orderEyebrow)}>{t('summary.title')}</p>

            {product || isFree ? (
              <>
                <p {...stylex.props(styles.orderName)}>{product ? product.name : freeName}</p>
                <p {...stylex.props(styles.orderMeta)}>
                  {[locationName, product ? cadenceOf(product) : null].filter(Boolean).join(' · ')}
                </p>

                <div {...stylex.props(styles.orderRule)} />

                <p {...stylex.props(styles.totalLabel)}>{t('summary.total')}</p>
                <p {...stylex.props(styles.totalValue)}>
                  {product
                    ? money(product.priceAmount, product.currency)
                    : t('packages.free.price')}
                </p>
              </>
            ) : (
              <p {...stylex.props(styles.orderEmpty)}>{t('summary.empty')}</p>
            )}

            {/* ONE action locus. The rail's button is "continue" while there
                are steps left and "pay" on the last one, so the buyer never
                has to look in two places for the way forward — and the total is
                directly above it the whole time.

                Back sits BESIDE it rather than under it: stacked, the two read
                as a sequence and "back" collected the eye last, after the button
                the buyer actually wanted. Side by side they read as a choice,
                and back stays the smaller of the two. */}
            <div {...stylex.props(styles.actionsRow)}>
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as Step)}
                  disabled={submitting}
                  {...stylex.props(styles.back)}
                >
                  <Icon name="arrowLeft" sw={2.2} {...stylex.props(styles.payIcon)} />
                  {t('back')}
                </button>
              ) : null}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => canAdvance && setStep((s) => (s + 1) as Step)}
                  disabled={!canAdvance}
                  {...stylex.props(styles.pay, !canAdvance && styles.payOff)}
                >
                  {t('continue')}
                  <Icon name="chevronRight" sw={2.2} {...stylex.props(styles.payIcon)} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canPay}
                  {...stylex.props(styles.pay, !canPay && styles.payOff)}
                >
                  <Icon name={isFree ? 'check' : 'lock'} sw={2} {...stylex.props(styles.payIcon)} />
                  {submitting
                    ? t('payment.processing')
                    : isFree
                      ? t('payment.createFree')
                      : t('payment.pay')}
                </button>
              )}
            </div>

            {/* The standing note is about settling at reception — true of every
                purchase, and untrue of the one choice that buys nothing. */}
            {isFree ? null : <p {...stylex.props(styles.orderNote)}>{t('summary.note')}</p>}
          </div>

          {error ? (
            <div {...stylex.props(styles.railError)}>
              <Banner tone="error">{error}</Banner>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}
