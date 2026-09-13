import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Cookie,
  type Page,
} from '@playwright/test';
import {
  DEV_PASSWORD,
  disconnectFixtures,
  gymIdBySlug,
  provisionMultiGymMember,
  seedTenantProduct,
} from '../fixtures';

/**
 * Tenant isolation across gym subdomains: a session belongs to the gym host it
 * was minted on, and nothing about one gym leaks onto another's.
 *
 * Driven on `<slug>.localhost:3001` with `NEXT_PUBLIC_ROOT_DOMAIN` /
 * `PLATFORM_ROOT_DOMAIN` = `localhost` (see `playwright.web.config.ts`), against
 * the two seeded gyms, `downtown` and `riverside`. What it pins down:
 *
 * - **Host-only session cookies.** A sign-in on `downtown` writes cookies the
 *   browser never sends to `riverside`, and a `downtown` token planted on
 *   `riverside` by hand is treated as no session — bounced to riverside's
 *   sign-in, and its cookies cleared.
 * - **Which hosts are tenants.** Reserved labels (`app`, `www`) render the
 *   generic portal; a label that names no gym is a `404`.
 * - **Refresh stays on its gym.** A session minted on `riverside` — which is NOT
 *   the member's primary gym — is still a `riverside` session after the web
 *   middleware silently refreshes it.
 * - **The API's tenant contract**, over HTTP: `x-tenant-host` (then RFC 7239
 *   `Forwarded`) selects the tenant of a public route, and an authenticated call
 *   carrying another gym's host is `403 TENANT_MISMATCH`.
 *
 * Each test builds its own browser context: isolation between hosts is the thing
 * under test, so no state may be inherited from a neighbour.
 */

// A per-run suffix keeps the fixture account and products unique across re-runs.
const RUN = Date.now();

const ROOT_DOMAIN = 'localhost';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '3001';
const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** `downtown.localhost` — what the web apps put in `x-tenant-host`. */
function tenantHost(label: string): string {
  return `${label}.${ROOT_DOMAIN}`;
}

/** `http://downtown.localhost:3001` — the portal origin for a subdomain label. */
function webOrigin(label: string): string {
  return `http://${tenantHost(label)}:${WEB_PORT}`;
}

const DOWNTOWN = webOrigin('downtown');
const RIVERSIDE = webOrigin('riverside');

/** The label no gym owns, for the unknown-tenant cases. */
const UNKNOWN_LABEL = 'nonexistent-xyz123';

const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';

/**
 * Belongs to `downtown` first (its primary gym) and `riverside` second, so a
 * session on `riverside` exists only because the sign-in asked for it.
 */
const member = { email: `e2e.tenant.${RUN}@e2e.test`, password: DEV_PASSWORD };

/** A `downtown` product: addable on downtown's host, unknown anywhere else. */
let downtownProduct: { gymId: string; productId: string; variantRef: string };
let riversideGymId: string;

/** The claims of a JWT, decoded without verification (the API signed it). */
function jwtClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new Error(`Not a JWT: ${token.slice(0, 16)}…`);
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** Regex-escape an origin so it can anchor a URL assertion. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `<origin>/en/member/login`, with or without a `?from=` query. */
function loginUrlOf(origin: string): RegExp {
  return new RegExp(`^${escapeRegExp(origin)}/en/member/login(\\?|$)`);
}

/** The named cookie the browser would send to `origin`, if any. */
async function cookieFor(
  context: BrowserContext,
  origin: string,
  name: string,
): Promise<Cookie | undefined> {
  return (await context.cookies(origin)).find((cookie) => cookie.name === name);
}

/** Sign in through the portal's own form on `origin` and wait to leave the login page. */
async function signIn(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/en/member/login`);
  await page.locator('input[name="email"]').fill(member.email);
  await page.locator('input[name="password"]').fill(member.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/member/login'), { timeout: 20_000 });
}

/** `POST /auth/login` straight to the API, optionally bound to a gym by slug. */
async function apiLogin(
  api: APIRequestContext,
  gymSlug?: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await api.post(`${API_URL}/auth/login`, {
    data: { email: member.email, password: member.password, ...(gymSlug ? { gymSlug } : {}) },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { accessToken: string; refreshToken: string };
}

test.describe('Tenant isolation across gym subdomains', () => {
  test.beforeAll(async () => {
    await provisionMultiGymMember(member.email, ['downtown', 'riverside']);
    downtownProduct = await seedTenantProduct('downtown', RUN);
    riversideGymId = await gymIdBySlug('riverside');
  });

  test.afterAll(async () => {
    await disconnectFixtures();
  });

  test.describe('session cookies', () => {
    let context: BrowserContext;
    let page: Page;

    test.beforeEach(async ({ browser }) => {
      context = await browser.newContext({ locale: 'en-US' });
      page = await context.newPage();
    });

    test.afterEach(async () => {
      await context?.close();
    });

    test('a downtown sign-in is not carried to riverside', async () => {
      await signIn(page, DOWNTOWN);

      const access = await cookieFor(context, DOWNTOWN, ACCESS_COOKIE);
      expect(access, 'downtown holds a session after signing in').toBeDefined();
      expect(jwtClaims(access!.value).gymSlug).toBe('downtown');
      // Host-only: Playwright reports a `Domain=` cookie with a leading dot.
      for (const cookie of await context.cookies(DOWNTOWN)) {
        if (cookie.name === ACCESS_COOKIE || cookie.name === REFRESH_COOKIE) {
          expect(cookie.domain, `${cookie.name} is host-only`).toBe(tenantHost('downtown'));
        }
      }

      expect(await cookieFor(context, RIVERSIDE, ACCESS_COOKIE)).toBeUndefined();
      expect(await cookieFor(context, RIVERSIDE, REFRESH_COOKIE)).toBeUndefined();

      await page.goto(`${RIVERSIDE}/en/member/home`);
      await expect(page).toHaveURL(loginUrlOf(RIVERSIDE));

      // …and downtown's own session is untouched by the visit.
      await page.goto(`${DOWNTOWN}/en/member/home`);
      await expect(page).not.toHaveURL(/\/member\/login/);
    });

    test("another gym's session planted on riverside is refused and cleared", async () => {
      await signIn(page, DOWNTOWN);
      const access = await cookieFor(context, DOWNTOWN, ACCESS_COOKIE);
      const refresh = await cookieFor(context, DOWNTOWN, REFRESH_COOKIE);
      expect(access).toBeDefined();
      expect(refresh).toBeDefined();

      // What a parent-domain cookie from before the host-only change amounts to:
      // downtown's session, sent to riverside.
      await context.addCookies(
        [access!, refresh!].map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          url: RIVERSIDE,
          httpOnly: true,
          sameSite: 'Lax' as const,
        })),
      );
      expect((await cookieFor(context, RIVERSIDE, ACCESS_COOKIE))?.value).toBe(access!.value);

      await page.goto(`${RIVERSIDE}/en/member/home`);
      await expect(page).toHaveURL(loginUrlOf(RIVERSIDE));

      // The mismatch purge expired both cookies on riverside…
      await expect
        .poll(async () => (await cookieFor(context, RIVERSIDE, ACCESS_COOKIE))?.value ?? null)
        .toBeNull();
      expect(await cookieFor(context, RIVERSIDE, REFRESH_COOKIE)).toBeUndefined();

      // …without reaching over to downtown's.
      expect((await cookieFor(context, DOWNTOWN, ACCESS_COOKIE))?.value).toBe(access!.value);
    });

    test('a refresh keeps a riverside session on riverside, not the primary gym', async ({
      request,
    }) => {
      // Precondition: downtown really is the primary gym, so a session that
      // drifted there on refresh would be visible below.
      const unbound = await apiLogin(request);
      expect(jwtClaims(unbound.accessToken).gymSlug).toBe('downtown');

      await signIn(page, RIVERSIDE);
      const before = {
        access: await cookieFor(context, RIVERSIDE, ACCESS_COOKIE),
        refresh: await cookieFor(context, RIVERSIDE, REFRESH_COOKIE),
      };
      expect(before.access).toBeDefined();
      expect(before.refresh).toBeDefined();
      expect(jwtClaims(before.access!.value).gymSlug).toBe('riverside');

      // Drop ONLY the access token, so the next navigation has to spend the
      // refresh cookie to stay signed in.
      await context.clearCookies({ name: ACCESS_COOKIE, domain: tenantHost('riverside') });
      expect(await cookieFor(context, RIVERSIDE, ACCESS_COOKIE)).toBeUndefined();

      await page.goto(`${RIVERSIDE}/en/member/home`);
      await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(RIVERSIDE)}/en/member/home`));

      const after = {
        access: await cookieFor(context, RIVERSIDE, ACCESS_COOKIE),
        refresh: await cookieFor(context, RIVERSIDE, REFRESH_COOKIE),
      };
      expect(after.access, 'the middleware minted a new access token').toBeDefined();
      expect(after.refresh?.value, 'the refresh token was rotated').not.toBe(before.refresh!.value);
      const claims = jwtClaims(after.access!.value);
      expect(claims.gymSlug).toBe('riverside');
      expect(claims.gymId).toBe(riversideGymId);
    });
  });

  test.describe('which hosts are tenants', () => {
    for (const label of ['app', 'www']) {
      test(`reserved "${label}" renders the generic portal, not a 404`, async ({ page }) => {
        const response = await page.goto(`${webOrigin(label)}/en/member/login`);
        expect(response?.status()).toBe(200);
        await expect(page.locator('input[name="email"]')).toBeVisible();
        await expect(page.getByText(/gym not found/i)).toHaveCount(0);
      });
    }

    test('a label no gym owns renders "gym not found" instead of the portal', async ({ page }) => {
      await page.goto(`${webOrigin(UNKNOWN_LABEL)}/en/member/login`);
      // The locale layout swaps the page for `GymNotFound`, so the document is not
      // an HTTP 404 — what matters is that no sign-in form for a phantom gym renders.
      await expect(page.getByRole('heading', { name: 'Gym not found' })).toBeVisible();
      await expect(page.locator('input[name="email"]')).toHaveCount(0);
    });
  });

  test.describe('API tenant contract', () => {
    /** `POST /cart/items` for the downtown product, as a guest, with `headers`. */
    async function addDowntownProduct(
      api: APIRequestContext,
      headers: Record<string, string>,
    ): Promise<number> {
      const res = await api.post(`${API_URL}/cart/items`, {
        headers,
        data: { variantId: downtownProduct.variantRef, qty: 1 },
      });
      return res.status();
    }

    test('x-tenant-host, then Forwarded, selects the tenant of a public route', async ({
      playwright,
    }) => {
      // A fresh context per call, so no guest-cart cookie links one to the next.
      const status = async (headers: Record<string, string>) => {
        const api = await playwright.request.newContext();
        try {
          return await addDowntownProduct(api, headers);
        } finally {
          await api.dispose();
        }
      };

      // The web apps' own header: downtown's product is found on downtown…
      expect(await status({ 'x-tenant-host': tenantHost('downtown') })).toBeLessThan(300);
      // …and does not exist on riverside, whose tenant the cart is now scoped to.
      expect(await status({ 'x-tenant-host': tenantHost('riverside') })).toBe(404);

      // Railway's edge keeps the client host only in RFC 7239 `Forwarded`.
      expect(
        await status({
          forwarded: `for=203.0.113.7;host="${tenantHost('downtown')}:443";proto=https`,
        }),
      ).toBeLessThan(300);

      // `x-tenant-host` outranks `Forwarded` and `x-forwarded-host`.
      expect(
        await status({
          'x-tenant-host': tenantHost('riverside'),
          forwarded: `host=${tenantHost('downtown')}`,
          'x-forwarded-host': tenantHost('downtown'),
        }),
      ).toBe(404);
    });

    test('a host naming no gym leaves the request tenant-less', async ({ request }) => {
      // The API's own host carries no tenant; that is the baseline to match.
      const bare = await request.get(`${API_URL}/cart`);
      expect(bare.ok(), 'a guest cart with no tenant fails closed').toBe(false);

      for (const label of [UNKNOWN_LABEL, 'app']) {
        const res = await request.get(`${API_URL}/cart`, {
          headers: { 'x-tenant-host': tenantHost(label) },
        });
        expect(res.status(), `x-tenant-host: ${tenantHost(label)}`).toBe(bare.status());
      }

      const scoped = await request.get(`${API_URL}/cart`, {
        headers: { 'x-tenant-host': tenantHost('downtown') },
      });
      expect(scoped.status()).toBe(200);
    });

    test("an authenticated call on another gym's host is 403 TENANT_MISMATCH", async ({
      request,
    }) => {
      const { accessToken } = await apiLogin(request, 'downtown');
      expect(jwtClaims(accessToken).gymSlug).toBe('downtown');
      const auth = { authorization: `Bearer ${accessToken}` };

      const own = await request.get(`${API_URL}/cart`, {
        headers: { ...auth, 'x-tenant-host': tenantHost('downtown') },
      });
      expect(own.status()).toBe(200);

      // No tenant host (a mobile client, the API's own host): nothing to compare.
      const hostless = await request.get(`${API_URL}/cart`, { headers: auth });
      expect(hostless.status()).toBe(200);

      const foreign = await request.get(`${API_URL}/cart`, {
        headers: { ...auth, 'x-tenant-host': tenantHost('riverside') },
      });
      expect(foreign.status()).toBe(403);
      expect(((await foreign.json()) as { code?: unknown }).code).toBe('TENANT_MISMATCH');
    });

    test('a refresh token stays pinned to the gym it was issued for', async ({ request }) => {
      const pair = await apiLogin(request, 'riverside');
      expect(jwtClaims(pair.accessToken).gymSlug).toBe('riverside');

      // Refreshed from a host naming another gym: the pin wins over the host.
      const res = await request.post(`${API_URL}/auth/refresh`, {
        headers: { 'x-tenant-host': tenantHost('downtown') },
        data: { refreshToken: pair.refreshToken },
      });
      expect(res.status(), await res.text()).toBe(200);
      const refreshed = (await res.json()) as { accessToken: string };
      expect(jwtClaims(refreshed.accessToken).gymSlug).toBe('riverside');
      expect(jwtClaims(refreshed.accessToken).gymId).toBe(riversideGymId);
    });
  });
});
