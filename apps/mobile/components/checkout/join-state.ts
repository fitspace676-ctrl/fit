// @fit/mobile — the join funnel's state machine, as a pure module.
//
// ===========================================================================
// FOUR STEPS, ONE SCREEN. NOT FOUR ROUTES.
//
// Web's wizard is one component holding a `0 | 1 | 2 | 3` step machine, and
// that shape is kept here deliberately rather than expanded into an
// `app/(join)/{location,package,details,payment}.tsx` stack. Three reasons, in
// order of how much they would have cost:
//
//   1. **The buyer's answers are one object.** Split across routes, every field
//      would have to survive a navigation — as search params (a password in the
//      URL), as a context provider wrapping the group (the same object, one
//      indirection further away), or as module state (invisible to the test
//      renderer). One `useReducer` is all three problems not existing.
//   2. **`reachable(i)` needs to see every step at once.** A step is not
//      reachable until its predecessors are satisfied, which is a statement
//      about the whole machine. On four routes it becomes four guards that can
//      disagree, and the failure mode is a deep link straight to the payment
//      step with no product chosen.
//   3. **Back is not "previous step".** Android's hardware back and the header
//      chevron would pop the navigator, so the funnel's own Back button and the
//      OS's would mean different things. With one route, back out of the funnel
//      is unambiguous and step-back is a state change.
//
// So this file is the machine and `app/(join)/checkout.tsx` is its renderer.
// Everything here is a pure function of state plus the catalogue, which is what
// lets `join-state.test.tsx` exercise the whole `reachable` table without a
// renderer, a router or a network.
// ===========================================================================

import {
  isStartDateWithinPolicy,
  missingSignupIntakeFields,
  PASSWORD_MIN_LENGTH,
  type CheckoutProductType,
  type Gender,
  type GymMemberIntakeSettings,
  type GymStartDatePolicy,
  type MemberIntakeField,
  type MemberSignupInput,
  type SignupCatalogueResponse,
} from '@fit/types';

import type { MessageKey } from '../../lib/i18n/keys';

// ─────────────────────────────────────────────────────────────────────────────
// The shape of the machine
// ─────────────────────────────────────────────────────────────────────────────

/** The four steps, by index. */
export type Step = 0 | 1 | 2 | 3;

/**
 * The steps in order. Kept as a `const` array rather than four constants so the
 * indicator, `reachable`, and the "step N of M" line all count the same thing —
 * web's `SECTIONS`, verbatim.
 */
export const SECTIONS = ['location', 'package', 'details', 'payment'] as const;

/** One step's name. */
export type Section = (typeof SECTIONS)[number];

/** Each step's own title, in `SECTIONS` order. */
export const STEP_TITLE_KEYS = [
  'checkout.locations.title',
  'checkout.packages.title',
  'checkout.details.title',
  'checkout.payment.title',
] as const satisfies readonly MessageKey[];

/** Each step's chip label, in `SECTIONS` order. */
export const STEP_CHIP_KEYS = [
  'checkout.steps.location',
  'checkout.steps.package',
  'checkout.steps.details',
  'checkout.steps.payment',
] as const satisfies readonly MessageKey[];

/**
 * The sentinel `productId` for "create a free account and pick a plan later".
 *
 * It lives in the SAME `productId` slot as a real catalogue id — web's trick,
 * and worth keeping — so the picker, the summary and the submit button stay one
 * code path instead of gaining a parallel `isFree` boolean that can disagree
 * with the selection. It cannot collide: no catalogue row has this id, so
 * {@link selectedProduct} answers `null` for it, which is exactly the condition
 * the free branch keys on.
 */
export const FREE_ACCOUNT_ID = '__free_account__';

/** Every answer the buyer has given, in one object. */
export interface JoinState {
  readonly step: Step;
  /** The branch. `null` until chosen — a single-branch gym auto-fills it. */
  readonly locationId: string | null;
  /** Which catalogue tab the picker is showing. */
  readonly productType: CheckoutProductType;
  /** The chosen row, or {@link FREE_ACCOUNT_ID}, or `null`. */
  readonly productId: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly password: string;
  readonly phone: string;
  readonly dateOfBirth: string;
  /**
   * `YYYY-MM-DD`. Deliberately NOT seeded with today: an untouched field must
   * read as unanswered so the gym's own "when do you start?" question is asked
   * rather than answered on the buyer's behalf.
   */
  readonly startDate: string;
  readonly gender: Gender | null;
  readonly personalId: string;
  /** The terms box. The one thing step 4 asks for. */
  readonly terms: boolean;
}

/** The text fields a keystroke can land on. */
export type JoinTextField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'password'
  | 'phone'
  | 'dateOfBirth'
  | 'startDate'
  | 'personalId';

/** Everything that can change the machine. */
export type JoinAction =
  | { readonly type: 'goto'; readonly step: Step }
  | { readonly type: 'location'; readonly locationId: string }
  | { readonly type: 'productType'; readonly productType: CheckoutProductType }
  | { readonly type: 'product'; readonly productId: string }
  | { readonly type: 'text'; readonly field: JoinTextField; readonly value: string }
  | { readonly type: 'gender'; readonly gender: Gender }
  | { readonly type: 'terms'; readonly terms: boolean };

/**
 * A fresh funnel.
 *
 * `productType: 'subscription'` because that is the tab the join screen opens
 * on: a membership is what the funnel sells, and a package is the alternative.
 */
export const initialJoinState: JoinState = {
  step: 0,
  locationId: null,
  productType: 'subscription',
  productId: null,
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  dateOfBirth: '',
  startDate: '',
  gender: null,
  personalId: '',
  terms: false,
};

/**
 * The machine.
 *
 * Two transitions do more than they look like they do, and both are corrections
 * the API would otherwise make for us at the price of a failed purchase:
 *
 *   * **Choosing a branch clears the product.** The catalogue is re-read scoped
 *     to the branch, so a package that was on sale at one location may not be at
 *     the next; keeping the id would carry a selection the new catalogue cannot
 *     show, and `POST /checkout` would answer `422 PRODUCT_UNAVAILABLE` at the
 *     very last step.
 *   * **Switching tab clears the product too.** `productType` and `productId`
 *     travel together in the checkout body — a `subscription` type with a
 *     package id is the same 422, and it is the one the buyer can least explain.
 */
export function joinReducer(state: JoinState, action: JoinAction): JoinState {
  switch (action.type) {
    case 'goto':
      return { ...state, step: action.step };
    case 'location':
      return { ...state, locationId: action.locationId, productId: null };
    case 'productType':
      return { ...state, productType: action.productType, productId: null };
    case 'product':
      return { ...state, productId: action.productId };
    case 'text':
      return { ...state, [action.field]: action.value };
    case 'gender':
      return { ...state, gender: action.gender };
    case 'terms':
      return { ...state, terms: action.terms };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// What the buyer picked
// ─────────────────────────────────────────────────────────────────────────────

/** One purchasable row, flattened out of the catalogue's three arrays. */
export interface JoinProduct {
  readonly id: string;
  readonly type: CheckoutProductType;
  readonly name: string;
  readonly description: string;
  /** Minor units — tetri. Formatting is the screen's job. */
  readonly priceAmount: number;
  readonly currency: string;
  /** `'month'` / `'year'` billing cadence, or `null` for a one-off. */
  readonly interval: 'month' | 'year' | null;
  /** Sessions included, when the row counts them. */
  readonly sessionCount: number | null;
  readonly features: readonly string[];
  readonly popular: boolean;
}

/**
 * The catalogue's rows of one type, in the shape the picker draws.
 *
 * Credit packs are included even though web's join screen excludes them
 * (`PRODUCT_TABS` is `['subscription','package']`): `checkout.packages.tabs`
 * carries a `credit_pack` label in both locales, `POST /checkout` accepts the
 * type, and `GET /catalogue` returns the array — so the only thing keeping them
 * off the phone would be a decision nobody wrote down. A gym with no packs shows
 * an empty tab, which is `checkout.packages.tabEmpty`'s whole job.
 */
export function productsOfType(
  catalogue: SignupCatalogueResponse | null,
  type: CheckoutProductType,
): readonly JoinProduct[] {
  if (catalogue === null) return [];
  switch (type) {
    case 'subscription':
      return catalogue.subscriptionPlans.map((plan) => ({
        id: plan.id,
        type,
        name: plan.name,
        description: plan.description,
        priceAmount: plan.priceAmount,
        currency: plan.currency,
        // The plan enum is `MONTH` / `YEAR`; the package enum is lower case.
        // Normalised here so the price suffix is chosen once.
        interval: plan.interval === 'YEAR' ? 'year' : 'month',
        sessionCount: null,
        features: plan.features,
        popular: plan.popular,
      }));
    case 'package':
      return catalogue.packages.map((pack) => ({
        id: pack.id,
        type,
        name: pack.name,
        description: pack.description,
        priceAmount: pack.priceAmount,
        currency: pack.currency,
        interval: pack.interval === 'one_time' ? null : pack.interval,
        sessionCount: pack.sessionCount,
        features: pack.features,
        popular: pack.popular,
      }));
    case 'credit_pack':
      return catalogue.creditPacks.map((pack) => ({
        id: pack.id,
        type,
        name: pack.name,
        description: '',
        priceAmount: pack.priceAmount,
        currency: pack.currency,
        interval: null,
        sessionCount: pack.sessionCount,
        features: [],
        popular: false,
      }));
  }
}

/**
 * The chosen row, or `null`.
 *
 * `null` covers three different situations and the caller must tell them apart
 * with {@link isFreeSelected}: nothing chosen yet, the free account chosen, and
 * a chosen id that the catalogue no longer carries (a branch switch, or a
 * product withdrawn between two reads). The third is why this looks the id up
 * every time instead of caching the row on selection.
 */
export function selectedProduct(
  catalogue: SignupCatalogueResponse | null,
  state: JoinState,
): JoinProduct | null {
  if (state.productId === null || state.productId === FREE_ACCOUNT_ID) return null;
  return (
    productsOfType(catalogue, state.productType).find((row) => row.id === state.productId) ?? null
  );
}

/**
 * Is the gym's free-account offer on the table?
 *
 * Only for a signed-out visitor. A member who already has an account cannot
 * "create one for free", and offering it to them would be a button that either
 * does nothing or creates a second account.
 */
export function freeAccountOffered(
  catalogue: SignupCatalogueResponse | null,
  signedIn: boolean,
): boolean {
  return catalogue !== null && catalogue.freeAccount.enabled && !signedIn;
}

/** Has the buyer chosen the free account? */
export function isFreeSelected(
  catalogue: SignupCatalogueResponse | null,
  state: JoinState,
  signedIn: boolean,
): boolean {
  return freeAccountOffered(catalogue, signedIn) && state.productId === FREE_ACCOUNT_ID;
}

// ─────────────────────────────────────────────────────────────────────────────
// The details step, built from the gym's own form settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which profile fields this gym asks a joiner for.
 *
 * NOT a fixed list. `GymMemberIntakeSettings` arrives on the catalogue precisely
 * because the visitor filling this form has no session and no other way to be
 * told, and `requiredIntakeFields` is the single statement of "on means
 * required" that the staff console, `POST /members` and `POST /auth/signup` all
 * answer to. A hard-coded form here would be the one member-create in the
 * product that ignores the gym's settings — which is the defect
 * `memberSignupSchemaFor` was introduced to fix on web.
 */
export function asksFor(intake: GymMemberIntakeSettings | null, field: MemberIntakeField): boolean {
  return intake !== null && intake[field];
}

/**
 * First and last joined, exactly as the API's `name` expects it.
 *
 * The surname is a UI-only split (`gymMemberIntakeSettingsSchema` says so): by
 * the time the body is built there is no separate surname left, which is also
 * why `missingSignupIntakeFields` marks `surname` satisfied unconditionally. So
 * a gym with `surname: true` gets the second input **shown but not enforced** —
 * carried over from web rather than diverged from, because the enforcement lives
 * in `@fit/types` and a mobile-only stricter rule would reject bodies the API
 * accepts.
 */
export function fullNameOf(state: JoinState): string {
  return `${state.firstName.trim()} ${state.lastName.trim()}`.trim();
}

/**
 * The `POST /auth/signup` body.
 *
 * Built BY OMISSION: a field the gym does not ask for is absent, not empty.
 * `memberSignupSchema` marks each one `.optional()` with a shape check, so
 * sending `dateOfBirth: ''` is a 400 while sending nothing at all is correct —
 * and the difference is invisible until a gym turns a toggle off.
 */
export function signupBodyFor(
  state: JoinState,
  gymId: string,
  intake: GymMemberIntakeSettings | null,
): MemberSignupInput {
  const asks = (field: MemberIntakeField): boolean => asksFor(intake, field);
  return {
    gymId,
    name: fullNameOf(state),
    email: state.email.trim(),
    password: state.password,
    ...(asks('phone') ? { phone: state.phone.trim() } : {}),
    ...(asks('dateOfBirth') ? { dateOfBirth: state.dateOfBirth.trim() } : {}),
    ...(asks('startDate') ? { startDate: state.startDate.trim() } : {}),
    ...(asks('gender') && state.gender !== null ? { gender: state.gender } : {}),
    ...(asks('personalId') ? { personalId: state.personalId.trim() } : {}),
  };
}

/** What the details step needs in order to answer "is this good enough to send?". */
export interface DetailsContext {
  readonly signedIn: boolean;
  readonly intake: GymMemberIntakeSettings | null;
  readonly startDatePolicy: GymStartDatePolicy | null;
  /** Today, `YYYY-MM-DD`. See `start-date.ts` for whose clock this is. */
  readonly today: string;
}

/**
 * Every field the buyer still has to fill, as `MemberIntakeField` names.
 *
 * Two sources, deliberately in this order:
 *
 *   1. the account fields `memberSignupSchema` requires unconditionally — name,
 *      a plausible email, a password of at least `PASSWORD_MIN_LENGTH`;
 *   2. `missingSignupIntakeFields`, the SHARED policy function the API itself
 *      calls, so the form's red borders and the server's rejection cannot
 *      disagree about what this gym asked for.
 *
 * The email test is deliberately shallow — an `@` with something either side.
 * The API runs the real one; a second, stricter client-side regex is how a
 * legitimate address gets refused by the phone and accepted by the website.
 */
export function missingDetailFields(
  state: JoinState,
  context: DetailsContext,
): readonly MemberIntakeField[] {
  const { intake } = context;
  if (intake === null) return [];
  const email = state.email.trim();
  const missing: MemberIntakeField[] = [];
  if (fullNameOf(state) === '') missing.push('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) missing.push('email');
  for (const field of missingSignupIntakeFields(signupBodyFor(state, 'gym', intake), intake)) {
    if (!missing.includes(field)) missing.push(field);
  }
  return missing;
}

/** Is the password long enough for the API to accept it? */
export function passwordAccepted(state: JoinState): boolean {
  return state.password.length >= PASSWORD_MIN_LENGTH;
}

/**
 * Is the chosen start date one the API will take?
 *
 * `true` when the gym does not ask for one — there is nothing to be wrong. When
 * it does, the check is `isStartDateWithinPolicy`, the SAME function
 * `apps/api` runs before writing, so the picker can never offer a day the
 * server refuses.
 */
export function startDateAccepted(state: JoinState, context: DetailsContext): boolean {
  if (!asksFor(context.intake, 'startDate')) return true;
  if (context.startDatePolicy === null) return false;
  return isStartDateWithinPolicy(state.startDate.trim(), context.startDatePolicy, context.today);
}

/**
 * Is the details step complete?
 *
 * A signed-in buyer skips it entirely: the account exists, the membership will
 * be added to it, and re-asking for a name and a password would be asking them
 * to create a second one.
 */
export function detailsReady(state: JoinState, context: DetailsContext): boolean {
  if (context.signedIn) return true;
  if (context.intake === null) return false;
  return (
    missingDetailFields(state, context).length === 0 &&
    passwordAccepted(state) &&
    startDateAccepted(state, context)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reachability
// ─────────────────────────────────────────────────────────────────────────────

/** Everything `stepsDone` has to weigh. */
export interface JoinContext extends DetailsContext {
  readonly catalogue: SignupCatalogueResponse | null;
}

/**
 * Which steps are satisfied, in `SECTIONS` order.
 *
 * Step 4 is `terms`, which is what makes the chip's numeral light once the box
 * is ticked; it is deliberately NOT what enables the pay button — see
 * {@link canSubmit}, which also weighs the gym, the product and the in-flight
 * request.
 */
export function stepsDone(state: JoinState, context: JoinContext): readonly boolean[] {
  const product = selectedProduct(context.catalogue, state);
  const free = isFreeSelected(context.catalogue, state, context.signedIn);
  return [
    // A gym with NO branches satisfies step 1 by having nothing to ask.
    // `createCheckoutSchema.locationId` is optional and `memberSignupSchema`
    // has no location at all, so such a gym can legitimately sell a
    // subscription — but web's rule (`Boolean(locationId)`) leaves the buyer on
    // an empty step with a dead Continue button and no way forward. A
    // deliberate divergence, flagged in the C4b report.
    state.locationId !== null || context.catalogue?.locations.length === 0,
    product !== null || free,
    detailsReady(state, context),
    state.terms,
  ];
}

/**
 * Is step `index` reachable?
 *
 * Web's rule verbatim: every step BEFORE it is satisfied. So the chips walk
 * backwards freely — every earlier step is by definition still satisfied — and
 * forwards only as far as the buyer has actually got. `reachable(0)` is
 * `[].every(...)`, i.e. always `true`.
 */
export function reachable(done: readonly boolean[], index: number): boolean {
  return done.slice(0, index).every(Boolean);
}

/** Can the buyer move on from the step they are on? */
export function canAdvance(state: JoinState, context: JoinContext): boolean {
  return stepsDone(state, context)[state.step] === true;
}

/**
 * Is the purchase good to send?
 *
 * Everything `stepsDone` weighs, plus the two things it cannot see: a resolved
 * tenant, and a request not already in flight. A second press while the first
 * call is running is how one buyer gets two memberships.
 */
export function canSubmit(
  state: JoinState,
  context: JoinContext,
  gymId: string | null,
  submitting: boolean,
): boolean {
  if (gymId === null || submitting) return false;
  const done = stepsDone(state, context);
  return done.every(Boolean);
}
