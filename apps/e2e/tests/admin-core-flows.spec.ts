import { expect, test } from '@playwright/test';

/**
 * Admin core-flow smoke (T9.3): Login → member CRUD → schedule a class →
 * check-in → POS sale, driven against the redesigned admin console.
 *
 * The steps are interdependent — the member created here is later checked in
 * and the product created here is later sold — so they run serially and share
 * the ids captured along the way. Auth is handled
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
/** Registered at the till, to prove it collects the same profile the roster does. */
const posMember = {
  name: `E2E Till Member ${RUN}`,
  email: `e2e.till.${RUN}@e2e.test`,
  phone: '+995555030303',
  dateOfBirth: '1990-05-17',
  personalId: `PID${RUN}`,
  address: '12 Rustaveli Ave',
  kinName: 'E2E Next Of Kin',
  kinPhone: '+995555040404',
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

    // Ring it up at the point of sale. The till opens on the Memberships tab, so
    // a retail product is not on screen until the catalogue is switched — the
    // search box filters whichever tab is showing, it does not span both.
    await page.goto('/pos');
    await page.getByRole('tab', { name: 'Products' }).click();
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

  test('POS: registering at the till collects the gym’s full intake', async ({ page }) => {
    // Both the roster drawer and the till read one config for which fields to ask
    // for. Switch the optional ones on here, then assert the till honours them —
    // that shared config is what stops the two entry points from drifting apart.
    await page.goto('/settings');
    // `exact` so this picks the Membership section and not "Trial memberships",
    // which also sits in the settings rail — role-name matching is substring by
    // default, so the shorter label is a prefix of the longer one.
    await page.getByRole('button', { name: 'Membership', exact: true }).click();
    let changed = false;
    for (const field of ['Date of birth', 'National ID', 'Address', 'Emergency contact']) {
      const toggle = page.getByRole('switch', { name: field });
      if (!(await toggle.isChecked())) {
        await toggle.check();
        changed = true;
      }
      await expect(toggle).toBeChecked();
    }
    // These fields are on by default now, so a run that toggled nothing has
    // nothing to save — and the save bar only leaves `inert` once the form is
    // dirty, so clicking it unconditionally would hang until the test timed out.
    // What this step guarantees is the *state*, not that a write happened.
    if (changed) {
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText('Unsaved changes')).toBeHidden({ timeout: 20_000 });
    }

    await page.goto('/pos');
    await page.getByRole('button', { name: 'Add new member' }).click();

    const drawer = page.getByRole('dialog', { name: 'Add member' });
    await expect(drawer).toBeVisible();

    // Selling a membership is the cart's job — offering enrolment here would let the
    // operator charge the same person twice.
    await expect(drawer.locator('#planId')).toHaveCount(0);
    await expect(drawer.locator('#paymentMethod')).toHaveCount(0);

    await drawer.locator('input[name="name"]').fill(posMember.name);
    await drawer.locator('input[name="email"]').fill(posMember.email);
    await drawer.locator('input[name="phone"]').fill(posMember.phone);
    await drawer.locator('#dateOfBirth').fill(posMember.dateOfBirth);
    await drawer.locator('#personalId').fill(posMember.personalId);
    await drawer.locator('#address').fill(posMember.address);
    await drawer.locator('#emergencyName').fill(posMember.kinName);
    await drawer.locator('#emergencyPhone').fill(posMember.kinPhone);
    await drawer.getByRole('button', { name: 'Create & attach' }).click();

    // The drawer closes and the new member is attached to the sale in progress.
    await expect(drawer).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(posMember.name).first()).toBeVisible({ timeout: 20_000 });

    // The profile actually persisted — not just the three fields the till used to
    // collect. The edit form shows every field regardless of intake config.
    await page.goto(`/members?search=${encodeURIComponent(posMember.name)}`);
    await page.getByRole('link', { name: posMember.name }).first().click();
    await page.waitForURL(/\/members\/(?!new$)[a-z0-9]+$/, { timeout: 20_000 });
    await page.goto(`${page.url()}/edit`);

    await expect(page.locator('#personalId')).toHaveValue(posMember.personalId);
    await expect(page.locator('#address')).toHaveValue(posMember.address);
    await expect(page.locator('#dateOfBirth')).toHaveValue(posMember.dateOfBirth);
    await expect(page.locator('#emergencyName')).toHaveValue(posMember.kinName);
    await expect(page.locator('#emergencyPhone')).toHaveValue(posMember.kinPhone);
  });
});
