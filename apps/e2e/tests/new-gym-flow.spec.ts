import { readFile } from 'node:fs/promises';
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Cookie,
} from '@playwright/test';
import { DEV_PASSWORD } from '../fixtures';
import { API_LOG_FILE, mailedLink } from '../mail-log';

/**
 * A new gym's first day, end to end, on its own subdomain — and not a trace of it
 * on anybody else's.
 *
 *   1. A platform operator (the seed's `superadmin@fit.local`) provisions the gym
 *      with `POST /admin/gyms`, the call the operator console's form makes. The
 *      owner is mailed an activation link on the gym's own console.
 *   2. The owner opens it, chooses a password, signs in, and lands in a console
 *      that is branded with their gym.
 *   3. That console's roster holds nobody from another gym.
 *   4. A member signs up on the gym's site, is mailed a verification link on that
 *      same site, verifies, signs in and reaches the portal.
 *   5. Against the seeded `downtown`: the owner's session is refused on downtown's
 *      console and by the API on downtown's host, and neither roster shows the
 *      other gym's people.
 *
 * Mail is read back out of the API's log (see `mail-log.ts`), so each step opens
 * the exact link the API built — which is the point: those links must name the
 * gym's host. The mailed origin is `http://<slug>.localhost` (no port, as
 * `tenantOrigin` builds it); the suite opens it on the member site's dev port,
 * where the `/admin` proxy lives.
 *
 * Driven by `playwright.new-gym.config.ts`. Everything is keyed to a per-run id, so
 * a retry (which starts over in a fresh worker) provisions a fresh gym.
 */

test.describe.configure({ mode: 'serial' });

const RUN = Date.now().toString(36);

const ROOT_DOMAIN = 'localhost';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '3001';
const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const SLUG = `e2e-newgym-${RUN}`;
const GYM_NAME = `E2E New Gym ${RUN}`;

/** `e2e-newgym-….localhost` — what the web apps put in `x-tenant-host`. */
function tenantHost(label: string): string {
  return `${label}.${ROOT_DOMAIN}`;
}

/** `http://<label>.localhost:3001` — where a tenant's site and console are driven. */
function webOrigin(label: string): string {
  return `http://${tenantHost(label)}:${WEB_PORT}`;
}

const NEW_GYM = webOrigin(SLUG);
const DOWNTOWN = webOrigin('downtown');

const superAdmin = { email: 'superadmin@fit.local', password: DEV_PASSWORD };
/** The seeded OWNER of `downtown` (see `global-setup.ts`). */
const downtownOwner = { email: 'alex@example.com', password: DEV_PASSWORD };
const owner = { email: `e2e.owner.${RUN}@e2e.test`, name: 'E2E Owner', password: 'NewGymOwner1!' };
const member = {
  email: `e2e.member.${RUN}@e2e.test`,
  name: 'E2E Member',
  password: 'NewGymMember1!',
};

const ACCESS_COOKIE = 'accessToken';

/** The claims of a JWT, decoded without verification (the API signed it). */
function jwtClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new Error(`Not a JWT: ${token.slice(0, 16)}…`);
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

/** Regex-escape a literal so it can anchor a URL or title assertion. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A mailed link, opened where the suite drives that host: same path + query, dev port. */
function onDevPort(link: URL): string {
  return `http://${link.hostname}:${WEB_PORT}${link.pathname}${link.search}`;
}

/** The named cookie the browser would send to `origin`, if any. */
async function cookieFor(
  context: BrowserContext,
  origin: string,
  name: string,
): Promise<Cookie | undefined> {
  return (await context.cookies(origin)).find((cookie) => cookie.name === name);
}

/** `POST /auth/login` straight to the API, optionally bound to a gym by slug. */
async function apiLogin(
  api: APIRequestContext,
  account: { email: string; password: string },
  gymSlug?: string,
): Promise<string> {
  const res = await api.post(`${API_URL}/auth/login`, {
    data: { email: account.email, password: account.password, ...(gymSlug ? { gymSlug } : {}) },
    ...(gymSlug ? { headers: { 'x-tenant-host': tenantHost(gymSlug) } } : {}),
  });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** `GET /members` as `token`, from `label`'s host — the console roster's own read. */
async function rosterEmails(
  api: APIRequestContext,
  token: string,
  label: string,
  search?: string,
): Promise<{ emails: string[]; total: number }> {
  const params = new URLSearchParams({ limit: '100', ...(search ? { search } : {}) });
  const res = await api.get(`${API_URL}/members?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}`, 'x-tenant-host': tenantHost(label) },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { data: { email: string }[]; total: number };
  return { emails: body.data.map((row) => row.email), total: body.total };
}

test.describe('A new gym, from provisioning to its first member', () => {
  let gymId: string;
  let activationLink: URL;
  /** The owner's browser: the console session they sign in to in step 2. */
  let ownerContext: BrowserContext;
  let memberContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    ownerContext = await browser.newContext({ locale: 'en-US' });
    memberContext = await browser.newContext({ locale: 'en-US' });
  });

  test.afterAll(async () => {
    await ownerContext?.close();
    await memberContext?.close();
  });

  // The API's output goes to a file rather than the runner's console, so a failure
  // brings its tail along — attached to the report and printed to the CI log.
  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    const log = await readFile(API_LOG_FILE, 'utf8').catch(() => '(no API log)');
    const tail = log.split('\n').slice(-200).join('\n');
    await testInfo.attach('api.log', { body: tail, contentType: 'text/plain' });
    console.log(`--- last 200 lines of ${API_LOG_FILE} ---\n${tail}`);
  });

  test("a platform operator provisions the gym and its owner is mailed a link to the gym's own console", async ({
    request,
  }) => {
    const operatorToken = await apiLogin(request, superAdmin);

    const res = await request.post(`${API_URL}/admin/gyms`, {
      headers: { authorization: `Bearer ${operatorToken}` },
      data: {
        gymName: GYM_NAME,
        subdomainSlug: SLUG,
        ownerEmail: owner.email,
        ownerName: owner.name,
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const created = (await res.json()) as { gymId: string; subdomainSlug: string };
    expect(created.subdomainSlug).toBe(SLUG);
    gymId = created.gymId;

    activationLink = await mailedLink(owner.email, '/admin/activate');
    expect(activationLink.origin, 'the activation link names the new gym').toBe(
      `http://${tenantHost(SLUG)}`,
    );
    expect(activationLink.searchParams.get('token')).toBeTruthy();
  });

  test('the owner activates, signs in, and lands in a console branded with their gym', async () => {
    const page = await ownerContext.newPage();

    await page.goto(onDevPort(activationLink));
    await page.locator('input[name="password"]').fill(owner.password);
    await page.locator('input[name="confirmPassword"]').fill(owner.password);
    await page.locator('form button[type="submit"]').click();

    // Activation issues no session: it hands over to this host's console sign-in,
    // with the address filled in.
    await page.waitForURL(
      (url) => url.pathname === '/admin/login' && url.searchParams.get('activated') === '1',
      { timeout: 60_000 },
    );
    expect(new URL(page.url()).origin).toBe(NEW_GYM);
    await expect(page.locator('input[name="email"]')).toHaveValue(owner.email);

    await page.locator('input[name="password"]').fill(owner.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/admin/login'), { timeout: 60_000 });
    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(NEW_GYM)}/admin/?(\\?|$)`));

    const access = await cookieFor(ownerContext, NEW_GYM, ACCESS_COOKIE);
    expect(access, 'the console sign-in left a session on the gym host').toBeDefined();
    expect(access!.domain, 'the session cookie is host-only').toBe(tenantHost(SLUG));
    expect(jwtClaims(access!.value).gymSlug).toBe(SLUG);
    expect(jwtClaims(access!.value).gymId).toBe(gymId);

    const dashboard = await page.goto(`${NEW_GYM}/admin`);
    expect(dashboard?.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/admin\/login/);
    await expect(page).toHaveTitle(new RegExp(escapeRegExp(GYM_NAME)));

    await page.close();
  });

  test("the new gym's roster holds nobody from another gym", async ({ request }) => {
    const ownerToken = await apiLogin(request, owner, SLUG);
    const downtownToken = await apiLogin(request, downtownOwner, 'downtown');

    const own = await rosterEmails(request, ownerToken, SLUG);
    expect(
      own.emails.filter((email) => email !== owner.email),
      'a brand-new gym has no members',
    ).toEqual([]);

    const downtown = await rosterEmails(request, downtownToken, 'downtown');
    expect(downtown.total, 'the seed gives downtown members to leak').toBeGreaterThan(0);

    const page = await ownerContext.newPage();
    const res = await page.goto(`${NEW_GYM}/admin/members`);
    expect(res?.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/admin\/login/);
    await expect(page.getByText(downtown.emails[0]!, { exact: true })).toHaveCount(0);
    await page.close();
  });

  test("a member signs up on the gym's site, verifies from the mailed link and reaches the portal", async ({
    request,
  }) => {
    // The join wizard's account step (`apps/web/lib/signup.ts`), with the profile
    // fields a gym's default intake settings require.
    const signup = await request.post(`${API_URL}/auth/signup`, {
      headers: { 'x-tenant-host': tenantHost(SLUG), 'accept-language': 'en' },
      data: {
        gymId,
        name: member.name,
        email: member.email,
        password: member.password,
        phone: '+995555000111',
        gender: 'OTHER',
        dateOfBirth: '1995-05-05',
        personalId: `E2E${RUN}`,
      },
    });
    expect(signup.status(), await signup.text()).toBe(201);

    // Not verified yet: the credentials are refused until the link is followed.
    const early = await request.post(`${API_URL}/auth/login`, {
      data: { email: member.email, password: member.password, gymSlug: SLUG },
    });
    expect(early.status(), 'an unverified member cannot sign in').toBe(403);

    const verifyLink = await mailedLink(member.email, '/member/verify');
    expect(verifyLink.origin, 'the verification link names the gym the member joined').toBe(
      `http://${tenantHost(SLUG)}`,
    );

    const page = await memberContext.newPage();
    const verified = await page.goto(onDevPort(verifyLink));
    expect(verified?.ok()).toBe(true);

    await page.goto(`${NEW_GYM}/en/member/login`);
    await page.locator('input[name="email"]').fill(member.email);
    await page.locator('input[name="password"]').fill(member.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((url) => !url.pathname.endsWith('/member/login'), { timeout: 60_000 });

    const access = await cookieFor(memberContext, NEW_GYM, ACCESS_COOKIE);
    expect(access, 'the portal sign-in left a session on the gym host').toBeDefined();
    expect(jwtClaims(access!.value).gymSlug).toBe(SLUG);

    const home = await page.goto(`${NEW_GYM}/en/member/home`);
    expect(home?.status()).toBe(200);
    await expect(page).toHaveURL(`${NEW_GYM}/en/member/home`);
    await page.close();
  });

  test('nothing crosses between the new gym and downtown', async ({ request }) => {
    // The owner's console session, carried to downtown's console by hand (a host-only
    // cookie never goes there on its own): no session there, and it is cleared.
    const access = await cookieFor(ownerContext, NEW_GYM, ACCESS_COOKIE);
    expect(access).toBeDefined();
    await ownerContext.addCookies([
      {
        name: access!.name,
        value: access!.value,
        url: DOWNTOWN,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const page = await ownerContext.newPage();
    await page.goto(`${DOWNTOWN}/admin`);
    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(DOWNTOWN)}/admin/login(\\?|$)`));
    await expect
      .poll(async () => (await cookieFor(ownerContext, DOWNTOWN, ACCESS_COOKIE))?.value || null)
      .toBeNull();
    await page.close();

    // The API: the owner's token is good on its own gym's host and 403 on downtown's.
    const ownerToken = await apiLogin(request, owner, SLUG);
    const auth = { authorization: `Bearer ${ownerToken}` };
    const own = await request.get(`${API_URL}/cart`, {
      headers: { ...auth, 'x-tenant-host': tenantHost(SLUG) },
    });
    expect(own.status(), await own.text()).toBe(200);
    const foreign = await request.get(`${API_URL}/cart`, {
      headers: { ...auth, 'x-tenant-host': tenantHost('downtown') },
    });
    expect(foreign.status()).toBe(403);
    expect(((await foreign.json()) as { code?: unknown }).code).toBe('TENANT_MISMATCH');

    // The rosters: the new member is on the new gym's and nowhere on downtown's.
    const downtownToken = await apiLogin(request, downtownOwner, 'downtown');
    expect((await rosterEmails(request, ownerToken, SLUG, member.email)).total).toBe(1);
    expect((await rosterEmails(request, downtownToken, 'downtown', member.email)).total).toBe(0);

    const newGymRoster = await rosterEmails(request, ownerToken, SLUG);
    expect(
      newGymRoster.emails.filter((email) => email !== owner.email && email !== member.email),
    ).toEqual([]);
    const downtownRoster = await rosterEmails(request, downtownToken, 'downtown');
    expect(downtownRoster.emails).not.toContain(member.email);
    expect(downtownRoster.emails).not.toContain(owner.email);
  });
});
