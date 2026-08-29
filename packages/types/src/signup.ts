// @fit/types — public member self-signup contracts.
//
// The tenant subdomain's join flow: a visitor who has no account picks a branch
// and a product, fills in their details, and pays — arriving in the member
// portal already signed in. Three shapes cross the boundary:
//
//   1. `GET /catalogue`   — everything the product step offers, signed out.
//   2. `POST /auth/signup` — account + gym membership + session, in one call.
//   3. `POST /checkout`   — the authenticated purchase that follows.
//
// Distinct from `./auth`'s `registerSchema`, which backs the plain
// `/register` screen and the staff-invite redemption: that flow creates a
// bare cross-gym `User` and issues no session. Self-signup always happens in
// the context of one gym and always ends with the buyer logged in.

import { z } from 'zod';
import type { creditPackCatalogueEntrySchema } from './credit-packs';
import { requiredIntakeFields } from './gym-settings';
import type {
  GymFreeAccountSettings,
  GymMemberIntakeSettings,
  GymStartDatePolicy,
  MemberIntakeField,
} from './gym-settings';
import type { locationSummarySchema } from './locations';
import { genderSchema } from './members';
import type { packageSummarySchema } from './packages';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth';

// ── Catalogue (step 1 + step 2, signed out) ───────────────────────────────

/**
 * A purchasable recurring plan as the signup wizard's "subscriptions" tab
 * renders it. Mirrors the catalogue subset of {@link packageSummarySchema} —
 * `SubscriptionPlan` rows are a separate table with their own interval enum, and
 * only the fields a buyer needs to choose are exposed (freeze allowance, credit
 * allowance and trial length are enrolment mechanics, not catalogue copy).
 */
export const subscriptionPlanSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  priceAmount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  /** Billing cadence — mirrors the Prisma `SubscriptionInterval` enum. */
  interval: z.enum(['MONTH', 'YEAR']),
  features: z.array(z.string()),
  popular: z.boolean(),
  /** Free-trial length in whole days; `0` when the plan charges immediately. */
  trialDays: z.number().int().nonnegative(),
});

/** A single subscription-plan card — {@link subscriptionPlanSummarySchema}. */
export type SubscriptionPlanSummary = z.infer<typeof subscriptionPlanSummarySchema>;

/**
 * Query for `GET /catalogue`. `gymId` scopes the listing to one tenant (the
 * wizard resolves it from the active subdomain); `locationId` is the branch
 * chosen in step 1 and narrows the package catalogue the way
 * `GET /packages?locationId=` does. An unknown gym yields empty arrays rather
 * than a 404 — the step renders that as its empty state.
 */
export const signupCatalogueQuerySchema = z.object({
  gymId: z.string().min(1),
  locationId: z.string().min(1).optional(),
});

/** Validated `GET /catalogue` query — {@link signupCatalogueQuerySchema}. */
export type SignupCatalogueQuery = z.infer<typeof signupCatalogueQuerySchema>;

/**
 * Successful `GET /catalogue` response — one round trip backing the whole
 * product step. `locations` lets the wizard decide whether step 1 is even worth
 * showing (a single-branch gym skips it); the three product arrays back the
 * step's tabs. Every array may be empty; that is a normal `200`.
 */
export interface SignupCatalogueResponse {
  locations: z.infer<typeof locationSummarySchema>[];
  packages: z.infer<typeof packageSummarySchema>[];
  subscriptionPlans: SubscriptionPlanSummary[];
  creditPacks: z.infer<typeof creditPackCatalogueEntrySchema>[];
  /**
   * The gym's free (no-purchase) join offer, from its settings. Travels with the
   * catalogue because it is one more thing the product step can offer, and the
   * step already pays for exactly one round trip; a disabled offer is `enabled:
   * false` rather than an absent key, so the client branches on a value it always
   * has.
   */
  freeAccount: GymFreeAccountSettings;
  /**
   * Which profile fields this gym's join form asks for — the same Settings →
   * Membership switches the staff console's Add-Member drawer reads. It travels
   * with the catalogue because the visitor filling the form has no session and
   * no other way to be told, and the step already pays for one round trip.
   */
  memberIntake: GymMemberIntakeSettings;
  /**
   * The window a chosen `startDate` may fall in. Travels beside `memberIntake`
   * for the same reason and on the same round trip: the toggle says whether the
   * wizard asks the question, and this says which answers the API will accept —
   * a date picker bounded by anything else would offer days the server refuses.
   */
  startDatePolicy: GymStartDatePolicy;
}

// ── Signup (step 3) ───────────────────────────────────────────────────────

/**
 * Body for `POST /auth/signup` — public member self-registration on one gym.
 *
 * Name, email and password are the account and are always required. WHICH
 * PROFILE FIELDS ARE MANDATORY IS THE GYM'S CALL, not this schema's: a gym that
 * wants a phone and a national id on file from day one switches them on under
 * Settings → Membership, and one that wants a two-field door does not. So they
 * are optional *here* and enforced by {@link memberSignupSchemaFor} against the
 * gym's own settings — the same `requiredIntakeFields` policy the staff console's
 * Add-Member drawer and `POST /members` already answer to. Before that they were
 * unconditionally required, which meant the join wizard was the one member-create
 * in the product that ignored the gym's form settings.
 *
 * `gymId` names the tenant the membership is created on; the wizard resolves it
 * from the subdomain. It is context, not a credential — the endpoint only ever
 * creates a plain `MEMBER` membership, so a crafted value can gain no privilege
 * beyond joining a different public gym.
 */
export const memberSignupSchema = z.object({
  gymId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  phone: z.string().trim().min(3).max(32).optional(),
  /** Calendar date, `YYYY-MM-DD`. Parsed to a `DateTime` server-side. */
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional(),
  gender: genderSchema.optional(),
  personalId: z.string().trim().min(1).max(64).optional(),
  /**
   * When the membership is to begin — calendar date, `YYYY-MM-DD`, in the GYM's
   * time zone. Shape only: whether the day is *allowed* is the gym's start-date
   * policy, which this schema has no access to. The API re-checks it against
   * `isStartDateWithinPolicy` before writing, so a body that skips the form
   * cannot enrol someone next year.
   */
  startDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional(),
});

/** Validated `POST /auth/signup` body — {@link memberSignupSchema}. */
export type MemberSignupInput = z.infer<typeof memberSignupSchema>;

/**
 * Which of the gym's required intake fields a signup body leaves empty.
 *
 * The single statement of "on means required" for the JOIN WIZARD, mirroring
 * `MembersService.assertIntakeSatisfied` for the staff console: the wizard marks
 * these inputs required and the API refuses a signup that omits one, both by
 * calling this — so the form a visitor is shown and the body the server accepts
 * cannot drift apart.
 *
 * The map is exhaustive over `MemberIntakeField` on purpose: adding a toggle
 * without answering for it here is a compile error rather than a setting the
 * form renders as mandatory and the server never checks. The fields the join form
 * does not collect are marked satisfied — a gym's address/next-of-kin switch
 * governs its own front desk, and enforcing it against a form with no such input
 * would make joining online impossible.
 */
export function missingSignupIntakeFields(
  input: Partial<MemberSignupInput>,
  intake: GymMemberIntakeSettings,
): MemberIntakeField[] {
  const filled = (value: string | null | undefined): boolean => Boolean(value?.trim());
  const present: Record<MemberIntakeField, boolean> = {
    name: filled(input.name),
    // The wizard joins first + last into `name` before sending, so there is no
    // separate value to be missing.
    surname: true,
    email: filled(input.email),
    phone: filled(input.phone),
    gender: Boolean(input.gender),
    dateOfBirth: filled(input.dateOfBirth),
    startDate: filled(input.startDate),
    personalId: filled(input.personalId),
    // Not on the join form — see the docstring.
    address: true,
    emergencyContact: true,
    medicalNotes: true,
    // Never required (`requiredIntakeFields` exempts both); the wizard's own
    // steps are where a plan and a payment method get chosen.
    membershipPlan: true,
    paymentMethod: true,
  };
  return requiredIntakeFields(intake).filter((field) => !present[field]);
}

/**
 * {@link memberSignupSchema} narrowed to one gym's form settings — the schema the
 * wizard validates against and the server enforces. A field the gym switched on
 * is reported as missing on the field itself, so the form can mark the input
 * rather than showing a form-level error.
 */
export function memberSignupSchemaFor(intake: GymMemberIntakeSettings) {
  return memberSignupSchema.superRefine((value, ctx) => {
    for (const field of missingSignupIntakeFields(value, intake)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'Required',
      });
    }
  });
}

/**
 * `409` code returned when the email already has an account. The wizard turns it
 * into a "you already have an account — sign in" branch rather than a dead end,
 * so the buyer keeps their place in the flow.
 */
export const EMAIL_TAKEN_CODE = 'EMAIL_TAKEN';

// ── Checkout (step 4) ─────────────────────────────────────────────────────

/**
 * Which catalogue table the chosen `productId` points at. The three products
 * settle differently — a package is the order itself, a subscription enrols the
 * member on a recurring plan, a credit pack mints a finite bundle of sessions —
 * so the type has to travel with the id.
 */
export const checkoutProductTypeSchema = z.enum(['package', 'subscription', 'credit_pack']);

/** The chosen product's catalogue — {@link checkoutProductTypeSchema}. */
export type CheckoutProductType = z.infer<typeof checkoutProductTypeSchema>;

/**
 * Body for `POST /checkout` — the authenticated purchase that closes the wizard.
 *
 * Deliberately minimal: the gym and the buying member are resolved from the
 * caller's session (never off the wire), and the price is read from the
 * catalogue row server-side, so a tampered body cannot buy someone else a
 * membership or set its own price. `locationId` records which branch the
 * purchase belongs to when the gym has more than one.
 */
export const createCheckoutSchema = z.object({
  productType: checkoutProductTypeSchema,
  productId: z.string().min(1),
  locationId: z.string().min(1).optional(),
  /**
   * An optional discount code. Checked against the catalogue being bought — a
   * code scoped to products does not discount a package — and refused loudly
   * rather than ignored, so a buyer expecting a discount never silently pays
   * full price.
   */
  promoCode: z.string().trim().min(1).max(64).optional(),
});

/** Validated `POST /checkout` body — {@link createCheckoutSchema}. */
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;

/**
 * Successful `POST /checkout` response.
 *
 * Deliberately **not** a single id: the three products settle onto different
 * financial records, and forcing them onto one would double-count revenue. A
 * package or credit pack raises a `PAID` `Order` (+ a stub `Payment`), so it
 * returns `orderId` and the confirmation reads `GET /checkout/:orderId`. A
 * subscription enrolment instead mints a numbered `Invoice` for the first
 * period, so it returns `subscriptionId` and the confirmation reads the member's
 * own `GET /me/subscription`. Exactly one of the two ids is non-null, keyed by
 * `productType`.
 *
 * There is no real payment gateway yet (the T8.8 stub): reaching this response
 * means the purchase was recorded and the membership reserved, and the wizard
 * shows "pay at the front desk" unless `NEXT_PUBLIC_PAYMENTS_ENABLED` is on.
 */
export const createCheckoutResponseSchema = z.object({
  productType: checkoutProductTypeSchema,
  /** The `PAID` order — set for `package` / `credit_pack`, null for a subscription. */
  orderId: z.string().min(1).nullable(),
  /** The live subscription — set for `subscription`, null otherwise. */
  subscriptionId: z.string().min(1).nullable(),
});

/** Validated `POST /checkout` response — {@link createCheckoutResponseSchema}. */
export type CreateCheckoutResponse = z.infer<typeof createCheckoutResponseSchema>;

/**
 * `422` code returned when the named product is missing, belongs to another gym,
 * or is not currently on sale. One code for all three so the endpoint never
 * reveals whether an id exists in a gym the caller cannot see.
 */
export const PRODUCT_UNAVAILABLE_CODE = 'PRODUCT_UNAVAILABLE';
