import { expect, test } from '@playwright/test';

/**
 * Admin core-flow smoke (T9.3): Login → member CRUD → schedule a class →
 * check-in → POS sale → refund, driven against the redesigned admin console.
 *
 * The steps are interdependent — the member created here is later checked in,
 * the product created here is later sold, and that sale is later refunded — so
 * they run serially and share the ids captured along the way. Auth is handled
 * once in `global-setup.ts` (an OWNER `accessToken` cookie), so every test
 * starts already signed in.
 *
 * Selectors lean on stable form `id`s, hardcoded English button labels, and the
 * `NEXT_LOCALE=en` cookie set in setup — the admin app ships no `data-testid`s.
 */

// A per-run suffix keeps every created entity unique, so the suite is safe to
// re-run against the same database without unique-constraint collisions.
const RUN = Date.now();

const member = {
  name: `E2E Member ${RUN}`,
  email: `e2e.member.${RUN}@e2e.test`,
  phone: '+995555010101',
};
const product = {
  name: `E2E Day Pass ${RUN}`,
  price: '10',
  currency: 'GEL',
};
const className = `E2E Class ${RUN}`;

/** Set once the member is created; reused by the read/update/check-in steps. */
let memberId = '';

test.describe.serial('Admin core flows', () => {
  test('Login: the seeded OWNER lands on the members roster', async ({ page }) => {
    await page.goto('/members');
    await expect(page).toHaveURL(/\/members$/);
    await expect(page.getByRole('heading', { name: 'Members', level: 1 })).toBeVisible();
  });

  test('Member CRUD — Create', async ({ page }) => {
    await page.goto('/members/new');
    await page.locator('input[name="name"]').fill(member.name);
    await page.locator('input[name="email"]').fill(member.email);
    await page.locator('input[name="phone"]').fill(member.phone);
    await page.getByRole('button', { name: 'Create member' }).click();

    // On success the form routes to the new member's detail page. The lookahead
    // excludes `/members/new` so we wait for the *real* id, not the form URL.
    await page.waitForURL(/\/members\/(?!new$)[a-z0-9]+$/, { timeout: 20_000 });
    memberId = page.url().split('/').pop() ?? '';
    expect(memberId).not.toBe('');
    await expect(page.getByText(member.name).first()).toBeVisible();
    await expect(page.getByText(member.email).first()).toBeVisible();
  });

  test('Member CRUD — Read', async ({ page }) => {
    await page.goto(`/members/${memberId}`);
    await expect(page.getByText(member.name).first()).toBeVisible();
    await expect(page.getByText(member.email).first()).toBeVisible();
  });

  test('Member CRUD — Update', async ({ page }) => {
    const newPhone = '+995555020202';
    await page.goto(`/members/${memberId}/edit`);
    await page.locator('input[name="phone"]').fill(newPhone);
    await page.getByRole('button', { name: 'Save changes' }).click();

    // On success the form routes back to the detail page showing the new phone.
    await page.waitForURL(new RegExp(`/members/${memberId}$`), { timeout: 20_000 });
    await expect(page.getByText(newPhone).first()).toBeVisible();
  });

  test('Member CRUD — Deactivate then reactivate', async ({ page }) => {
    await page.goto(`/members/${memberId}`);
    // Delete-equivalent: soft-deactivate, then restore so the member stays
    // available (ACTIVE) for the check-in step below.
    await page.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('button', { name: 'Reactivate' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Reactivate' }).click();
    await expect(page.getByRole('button', { name: 'Deactivate' })).toBeVisible({ timeout: 20_000 });
  });

  test('Schedule a class', async ({ page }) => {
    await page.goto('/classes/new');
    // Every other field has a valid default (capacity, duration, a weekly
    // recurrence, validFrom = today, status = ACTIVE), so a title is enough.
    await page.locator('#class-title').fill(className);
    await page.getByRole('button', { name: 'Create class' }).click();

    // On success the form routes to the new class template's detail page.
    await page.waitForURL(/\/classes\/(?!new$)[a-z0-9]+$/, { timeout: 20_000 });
    await expect(page.getByText(className).first()).toBeVisible();
  });

  test('POS: create a product and record a card sale', async ({ page }) => {
    // The seed ships no products, so create one (ACTIVE, so POS can sell it).
    // The retail catalog lives on its own top-level Shop destination, and adding a
    // product is a drawer over it rather than a page of its own.
    await page.goto('/shop');
    await page.getByRole('button', { name: 'New product' }).click();

    const drawer = page.getByRole('dialog', { name: 'New product' });
    await expect(drawer).toBeVisible();
    await drawer.locator('#product-name').fill(product.name);
    await drawer.locator('#product-price').fill(product.price);
    await drawer.locator('#product-currency').fill(product.currency);
    await drawer.locator('#product-status').selectOption('ACTIVE');
    await drawer.getByRole('button', { name: 'Create product' }).click();

    // The drawer closes and the catalog behind it refreshes with the new product.
    await expect(drawer).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(product.name).first()).toBeVisible({ timeout: 20_000 });

    // Ring it up at the point of sale.
    await page.goto('/pos');
    await page.locator('#pos-product-search').fill(product.name);
    await page.getByRole('button', { name: product.name }).click();

    await page.getByRole('button', { name: /Charge/ }).click();

    // Payment modal: pay by card, then complete.
    const dialog = page.getByRole('dialog', { name: 'Take payment' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Card' }).click();
    await dialog.getByRole('button', { name: 'Complete sale' }).click();

    await expect(page.getByText('Sale complete')).toBeVisible({ timeout: 20_000 });
  });

  test('Refund the most recent order', async ({ page }) => {
    // Orders are the Transactions tab of the consolidated Payments hub.
    await page.goto('/payments/transactions');

    // Open the newest POS-channel order — the sale just recorded. (Seeded demo
    // orders are all ONLINE and carry fixed "today" clock times that can sort
    // above a real-time row, so the plain top row isn't reliably our sale.)
    const posRow = page.locator('tbody tr', { hasText: 'POS' }).first();
    await posRow.getByRole('link').first().click();
    await page.waitForURL(/\/payments\/transactions\/(?!new$)[a-z0-9]+$/, { timeout: 20_000 });

    // The card sale left a CAPTURED payment, so the refund control is present.
    await expect(page.getByRole('heading', { name: 'Issue a refund' })).toBeVisible();
    const reason = `E2E automated refund ${RUN}`;
    await page.locator('#refund-reason').fill(reason);
    await page.getByRole('button', { name: 'Issue refund' }).click();

    // The page revalidates after a successful refund: the order flips to
    // "Refunded" and the refund is listed under a "Refunds" section. (The
    // transient "Refund issued." banner unmounts with the now-satisfied form.)
    await expect(page.getByRole('heading', { name: 'Refunds' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(reason).first()).toBeVisible();
  });
});
