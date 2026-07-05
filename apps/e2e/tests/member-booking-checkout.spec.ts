import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  disconnectFixtures,
  provisionMember,
  seedMemberCatalogue,
  type MemberCatalogue,
} from '../fixtures';

/**
 * Member booking + checkout smoke (T9.4): register → verify → sign in → book a
 * class (capacity path) → join a full class's waitlist → buy from the shop,
 * driven against the redesigned member portal (`@fit/web`) on the `downtown`
 * tenant subdomain, backed by the real API + Postgres + Redis.
 *
 * The steps are interdependent — the account registered here is the one that
 * later signs in and books, and the booking made here is the one asserted on the
 * bookings page — so they run serially over a **single shared browser context**:
 * the session cookies the sign-in plants must survive into the booking + shop
 * steps, which Playwright's default per-test isolation would drop.
 *
 * A couple of preconditions can't be produced through the member UI (the emailed
 * verification link, gym enrolment, an entitling subscription, and a retail
 * catalogue) and are seeded directly via `../fixtures`; everything the portal
 * *does* own — registration, sign-in, booking, the shop cart — is exercised
 * through the browser. Selectors lean on input `name`s, ARIA roles, and the
 * English button labels the `en` locale renders (the app is driven on `/en`).
 */

// A per-run suffix keeps every created entity unique, so the suite is safe to
// re-run against the same database without collisions.
const RUN = Date.now();

// The tenant host the portal is driven on (kept in step with the web config).
const WEB_HOST = process.env.E2E_WEB_HOST ?? 'downtown.localhost:3001';
const BASE_URL = `http://${WEB_HOST}`;

const member = {
  name: `E2E Member ${RUN}`,
  email: `e2e.member.${RUN}@e2e.test`,
  password: 'Test1234!',
};

/** Catalogue ids seeded before the run (product + bookable/full occurrences). */
let catalogue: MemberCatalogue;
/** The shared session every step drives — created once, closed at the end. */
let context: BrowserContext;
let page: Page;

test.describe.serial('Member booking + checkout', () => {
  test.beforeAll(async ({ browser }) => {
    // The member-independent fixtures: a product and two future classes. The
    // member's own account is provisioned mid-run, once registration has created
    // the user row (see the "verify + enrol" step).
    catalogue = await seedMemberCatalogue(RUN);

    context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US' });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
    await disconnectFixtures();
  });

  test('Register: a new member signs up and is told to check their inbox', async () => {
    await page.goto('/en/register');

    await page.locator('input[name="name"]').fill(member.name);
    await page.locator('input[name="email"]').fill(member.email);
    await page.locator('input[name="password"]').fill(member.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Registration issues no session — it emails a verification link — so the
    // form is replaced by a "check your inbox" status notice. Scope to the
    // notice text: the Astryx submit/toggle buttons also expose (empty)
    // role="status" loading live regions, so a bare getByRole('status') would
    // strict-mode-match multiple elements.
    const inboxNotice = page.getByRole('status').filter({ hasText: 'Almost there!' });
    await expect(inboxNotice).toBeVisible({ timeout: 20_000 });
  });

  test('Verify email + enrol (out-of-band)', async () => {
    // Simulate the member clicking the emailed verification link and ending up an
    // enrolled, entitled member of the gym — none of which the portal exposes to
    // drive through the browser. From here the account can sign in and book.
    await provisionMember(member.email, catalogue.gymId);
  });

  test('Sign in: the verified member lands on their home', async () => {
    await page.goto('/en/login');
    await page.locator('input[name="email"]').fill(member.email);
    await page.locator('input[name="password"]').fill(member.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // On success the portal replaces the login route with the member home. The
    // lookahead keeps us from matching the `/login` we started on.
    await page.waitForURL(/\/en(?!\/login)(\/|$)/, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Book a class — capacity path', async () => {
    // Deep-link the occurrence detail page; a signed-in member gets the real
    // booking button, labelled "Book" while seats remain.
    await page.goto(`/en/classes/${catalogue.bookableClassId}`);
    await page.getByRole('button', { name: 'Book' }).click();

    // The action toasts and refreshes in place (no navigation). Assert on the
    // durable record: the bookings page lists it as "Booked".
    await expect(page.getByText('Booked! See you there')).toBeVisible({ timeout: 20_000 });

    await page.goto('/en/account/bookings');
    await expect(page.getByText('Booked', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('Join the waitlist — full class path', async () => {
    // The full occurrence (zero capacity) renders the same button labelled
    // "Join waitlist"; booking it queues the member rather than seating them.
    await page.goto(`/en/classes/${catalogue.fullClassId}`);
    await page.getByRole('button', { name: 'Join waitlist' }).click();

    await expect(page.getByText('Added to the waitlist')).toBeVisible({ timeout: 20_000 });

    // The bookings page shows a waitlist entry as its queued position, e.g.
    // "Waitlist · #1" (a confirmed seat shows the "Booked" badge instead).
    await page.goto('/en/account/bookings');
    await expect(page.getByText(/Waitlist · #\d+/).first()).toBeVisible({ timeout: 20_000 });
  });

  test('Shop → cart → checkout', async () => {
    // Add the seeded product from the shop grid.
    await page.goto('/en/shop');
    const card = page.locator('li', { hasText: catalogue.productName });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Added to cart')).toBeVisible({ timeout: 20_000 });

    // Review the cart and confirm the line landed before paying.
    await page.goto('/en/cart');
    await expect(page.getByText(catalogue.productName).first()).toBeVisible({ timeout: 20_000 });

    // Place the order — pickup defaults to the gym's first location, so no manual
    // selection is needed. Checkout swaps the cart for an in-place confirmation.
    await page.getByRole('button', { name: /Place order/ }).click();
    await expect(page.getByText('Order confirmed')).toBeVisible({ timeout: 20_000 });
  });
});
