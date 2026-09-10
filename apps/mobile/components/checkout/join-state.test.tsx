// The join funnel's step machine, exercised without a renderer.
//
// It lives under `components/`, so by the extension split (`jest.config.js`)
// this is a `*.test.tsx` on jest-expo rather than a `*.spec.ts` on Vitest —
// `vitest.config.ts` includes only `lib|hooks|app/**/*.spec.ts`. Nothing here
// mounts anything; the file is the same shape as
// `components/shop/catalogue.test.tsx`, which pins that lane's pure helpers the
// same way.
//
// What is worth pinning here, and why:
//
//   * `reachable` is the rule the step chips are wired to. Get it wrong in the
//     permissive direction and a buyer reaches the payment step with no product;
//     wrong in the strict direction and they cannot walk backwards.
//   * `signupBodyFor` builds BY OMISSION. A field the gym does not ask for must
//     be ABSENT, not `''` — `memberSignupSchema` marks each one `.optional()`
//     WITH a shape check, so an empty string is a 400 while a missing key is
//     correct. That difference is invisible until a gym turns a toggle off.
//   * the details rules are the gym's, read through `missingSignupIntakeFields`
//     — the same function `apps/api` calls — so the form and the server cannot
//     disagree about what was asked for.
import type {
  GymMemberIntakeSettings,
  GymStartDatePolicy,
  SignupCatalogueResponse,
} from '@fit/types';

import {
  FREE_ACCOUNT_ID,
  SECTIONS,
  canAdvance,
  canSubmit,
  detailsReady,
  freeAccountOffered,
  fullNameOf,
  initialJoinState,
  isFreeSelected,
  joinReducer,
  missingDetailFields,
  productsOfType,
  reachable,
  selectedProduct,
  signupBodyFor,
  startDateAccepted,
  stepsDone,
  type JoinContext,
  type JoinState,
} from './join-state';

const INTAKE: GymMemberIntakeSettings = {
  name: true,
  surname: false,
  email: true,
  phone: true,
  gender: true,
  dateOfBirth: true,
  startDate: false,
  personalId: true,
  address: true,
  emergencyContact: true,
  membershipPlan: true,
  paymentMethod: false,
  medicalNotes: false,
};

const POLICY: GymStartDatePolicy = { maxDaysAhead: 14, allowPast: false };

const CATALOGUE: SignupCatalogueResponse = {
  locations: [
    {
      id: 'loc_1',
      name: 'Downtown',
      address: '1 Rustaveli',
      photoUrl: null,
      amenities: [],
      hours: {},
    },
    {
      id: 'loc_2',
      name: 'Vake',
      address: '9 Chavchavadze',
      photoUrl: null,
      amenities: [],
      hours: {},
    },
  ],
  packages: [
    {
      id: 'pkg_1',
      name: '10 PT sessions',
      description: 'One to one.',
      priceAmount: 40000,
      currency: 'GEL',
      interval: 'one_time',
      sessionCount: 10,
      features: ['Coach matched to you'],
      popular: false,
    },
  ],
  subscriptionPlans: [
    {
      id: 'plan_1',
      name: 'Unlimited',
      description: 'Every class.',
      priceAmount: 8900,
      currency: 'GEL',
      interval: 'MONTH',
      features: ['All classes'],
      popular: true,
      trialDays: 0,
    },
  ],
  creditPacks: [
    {
      id: 'pack_1',
      name: '5 credits',
      priceAmount: 20000,
      currency: 'GEL',
      sessionCount: 5,
      validityDays: 90,
    },
  ],
  freeAccount: { enabled: true, name: 'Free account', description: 'Pick a plan later.' },
  memberIntake: INTAKE,
  startDatePolicy: POLICY,
};

const TODAY = '2026-08-31';

function context(overrides: Partial<JoinContext> = {}): JoinContext {
  return {
    catalogue: CATALOGUE,
    signedIn: false,
    intake: INTAKE,
    startDatePolicy: POLICY,
    today: TODAY,
    ...overrides,
  };
}

/** A state that satisfies everything the default intake asks for. */
function filled(overrides: Partial<JoinState> = {}): JoinState {
  return {
    ...initialJoinState,
    locationId: 'loc_1',
    productType: 'subscription',
    productId: 'plan_1',
    firstName: 'Nino',
    lastName: 'Beridze',
    email: 'nino@example.test',
    password: 'correct-horse',
    phone: '+995555000000',
    dateOfBirth: '1994-04-01',
    gender: 'FEMALE',
    personalId: '01001000000',
    terms: true,
    ...overrides,
  };
}

describe('the reducer', () => {
  it('CLEARS THE PRODUCT when the branch changes', () => {
    // The catalogue is re-read scoped to the branch, so a package on sale at
    // one location may not be at the next. Keeping the id would carry a
    // selection the new catalogue cannot show, and `POST /checkout` would
    // answer 422 at the very last step.
    const next = joinReducer(filled(), { type: 'location', locationId: 'loc_2' });
    expect(next.locationId).toBe('loc_2');
    expect(next.productId).toBeNull();
  });

  it('CLEARS THE PRODUCT when the tab changes', () => {
    // `productType` and `productId` travel together in the checkout body; a
    // `subscription` type with a package id is the same 422.
    const next = joinReducer(filled(), { type: 'productType', productType: 'package' });
    expect(next.productType).toBe('package');
    expect(next.productId).toBeNull();
  });

  it('writes text, gender, terms and the step', () => {
    expect(
      joinReducer(initialJoinState, { type: 'text', field: 'email', value: 'a@b.c' }).email,
    ).toBe('a@b.c');
    expect(joinReducer(initialJoinState, { type: 'gender', gender: 'OTHER' }).gender).toBe('OTHER');
    expect(joinReducer(initialJoinState, { type: 'terms', terms: true }).terms).toBe(true);
    expect(joinReducer(initialJoinState, { type: 'goto', step: 2 }).step).toBe(2);
  });
});

describe('reachable', () => {
  it('always admits the first step', () => {
    expect(reachable([false, false, false, false], 0)).toBe(true);
  });

  it('admits a step only when every step BEFORE it is satisfied', () => {
    const done = [true, true, false, false];
    expect(reachable(done, 1)).toBe(true);
    expect(reachable(done, 2)).toBe(true);
    // Details is unsatisfied, so payment is out of reach.
    expect(reachable(done, 3)).toBe(false);
  });

  it('lets the buyer walk all the way back from the last step', () => {
    const done = [true, true, true, true];
    expect(SECTIONS.map((_, index) => reachable(done, index))).toEqual([true, true, true, true]);
  });
});

describe('stepsDone', () => {
  it('is all false on a fresh funnel', () => {
    expect(stepsDone(initialJoinState, context())).toEqual([false, false, false, false]);
  });

  it('is all true once every answer is given', () => {
    expect(stepsDone(filled(), context())).toEqual([true, true, true, true]);
  });

  it('counts the free account as a chosen product', () => {
    const state = filled({ productId: FREE_ACCOUNT_ID });
    expect(selectedProduct(CATALOGUE, state)).toBeNull();
    expect(isFreeSelected(CATALOGUE, state, false)).toBe(true);
    expect(stepsDone(state, context())[1]).toBe(true);
  });

  it('does NOT offer the free account to a signed-in buyer', () => {
    // They already have one; "create an account for free" is a button that
    // either does nothing or creates a second.
    expect(freeAccountOffered(CATALOGUE, true)).toBe(false);
    expect(isFreeSelected(CATALOGUE, filled({ productId: FREE_ACCOUNT_ID }), true)).toBe(false);
  });

  it('satisfies the branch step for a gym with NO branches', () => {
    // Web's rule is `Boolean(locationId)`, which leaves such a buyer on an empty
    // step with a dead Continue button. `locationId` is optional on
    // `createCheckoutSchema` and absent from `memberSignupSchema`, so a
    // branchless gym can legitimately sell — a deliberate divergence.
    const empty = { ...CATALOGUE, locations: [] };
    expect(stepsDone(initialJoinState, context({ catalogue: empty }))[0]).toBe(true);
  });

  it('drives canAdvance from the CURRENT step only', () => {
    const onPackages = filled({ step: 1, productId: null, terms: false });
    expect(canAdvance(onPackages, context())).toBe(false);
    expect(canAdvance({ ...onPackages, productId: 'plan_1' }, context())).toBe(true);
  });
});

describe('canSubmit', () => {
  it('refuses without a tenant, and refuses a second press', () => {
    expect(canSubmit(filled(), context(), null, false)).toBe(false);
    // A second press while the first call is in flight is how one buyer gets
    // two memberships.
    expect(canSubmit(filled(), context(), 'gym_1', true)).toBe(false);
    expect(canSubmit(filled(), context(), 'gym_1', false)).toBe(true);
  });

  it('refuses until the terms box is ticked', () => {
    expect(canSubmit(filled({ terms: false }), context(), 'gym_1', false)).toBe(false);
  });
});

describe('productsOfType', () => {
  it('normalises the two different interval enums onto one', () => {
    // `SubscriptionPlan.interval` is `MONTH`/`YEAR`; `Package.interval` is
    // lower-case with a `one_time` arm. The price suffix is chosen once.
    expect(productsOfType(CATALOGUE, 'subscription')[0]?.interval).toBe('month');
    expect(productsOfType(CATALOGUE, 'package')[0]?.interval).toBeNull();
  });

  it('offers credit packs, which web deliberately hides', () => {
    // `checkout.packages.tabs.credit_pack` is authored in both locales,
    // `POST /checkout` accepts the type, and `GET /catalogue` returns the array.
    expect(productsOfType(CATALOGUE, 'credit_pack').map((row) => row.id)).toEqual(['pack_1']);
  });

  it('is empty with no catalogue', () => {
    expect(productsOfType(null, 'subscription')).toEqual([]);
  });
});

describe('signupBodyFor', () => {
  it('OMITS a field the gym does not ask for — it does not send an empty one', () => {
    const body = signupBodyFor(filled(), 'gym_1', INTAKE);
    // `startDate` is off in this gym's settings.
    expect('startDate' in body).toBe(false);
    expect(body.phone).toBe('+995555000000');
    expect(body.gymId).toBe('gym_1');
  });

  it('joins first and last into the single `name` the schema takes', () => {
    expect(fullNameOf(filled())).toBe('Nino Beridze');
    expect(signupBodyFor(filled(), 'gym_1', INTAKE).name).toBe('Nino Beridze');
    // Only a first name is still a name.
    expect(fullNameOf(filled({ lastName: '' }))).toBe('Nino');
  });

  it('omits gender when the gym asks but nothing is chosen', () => {
    // `genderSchema` has no empty arm, so `gender: ''` would be a 400.
    expect('gender' in signupBodyFor(filled({ gender: null }), 'gym_1', INTAKE)).toBe(false);
  });
});

describe('missingDetailFields', () => {
  it('reports nothing when the form is complete', () => {
    expect(missingDetailFields(filled(), context())).toEqual([]);
  });

  it('reports the account fields the schema always requires', () => {
    const bare = { ...initialJoinState };
    const missing = missingDetailFields(bare, context());
    expect(missing).toContain('name');
    expect(missing).toContain('email');
  });

  it('reports only what THIS gym asked for', () => {
    const lean: GymMemberIntakeSettings = {
      ...INTAKE,
      phone: false,
      gender: false,
      dateOfBirth: false,
      personalId: false,
    };
    const state = filled({ phone: '', gender: null, dateOfBirth: '', personalId: '' });
    expect(missingDetailFields(state, context({ intake: lean }))).toEqual([]);
    // The same state against the fuller settings reports all four.
    expect(missingDetailFields(state, context())).toEqual(
      expect.arrayContaining(['phone', 'gender', 'dateOfBirth', 'personalId']),
    );
  });

  it('accepts a Georgian name', () => {
    // The pattern is three for three (the QR encoder's byte length, the i18n
    // argument parity, `toUpperCase()` on Mkhedruli): anything touching text
    // needs a Georgian case, not only an ASCII one.
    const state = filled({ firstName: 'ნინო', lastName: 'ბერიძე' });
    expect(fullNameOf(state)).toBe('ნინო ბერიძე');
    expect(missingDetailFields(state, context())).toEqual([]);
  });
});

describe('the start-date window', () => {
  it('is satisfied when the gym does not ask', () => {
    expect(startDateAccepted(filled({ startDate: '' }), context())).toBe(true);
  });

  it('accepts a day inside the window and refuses one outside it', () => {
    const asks = context({ intake: { ...INTAKE, startDate: true } });
    expect(startDateAccepted(filled({ startDate: TODAY }), asks)).toBe(true);
    expect(startDateAccepted(filled({ startDate: '2026-09-14' }), asks)).toBe(true);
    expect(startDateAccepted(filled({ startDate: '2026-09-15' }), asks)).toBe(false);
    // `allowPast` is off by default: backdating is a staff correction.
    expect(startDateAccepted(filled({ startDate: '2026-08-30' }), asks)).toBe(false);
  });

  it('blocks the details step while the date is unanswered', () => {
    const asks = context({ intake: { ...INTAKE, startDate: true } });
    expect(detailsReady(filled({ startDate: '' }), asks)).toBe(false);
    expect(detailsReady(filled({ startDate: TODAY }), asks)).toBe(true);
  });
});

describe('detailsReady', () => {
  it('is true for a signed-in buyer with nothing typed', () => {
    expect(detailsReady(initialJoinState, context({ signedIn: true }))).toBe(true);
  });

  it('is false while the catalogue — and therefore the gym’s form — is unknown', () => {
    expect(detailsReady(filled(), context({ intake: null }))).toBe(false);
  });

  it('refuses a password shorter than the API accepts', () => {
    expect(detailsReady(filled({ password: 'short' }), context())).toBe(false);
  });
});
