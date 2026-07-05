import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request, type FullConfig } from '@playwright/test';

/**
 * Seeded OWNER of the `downtown` gym (see `packages/db/prisma/seed.ts`). OWNER
 * carries every admin permission, so one login exercises all the gated screens.
 */
const ADMIN_EMAIL = 'alex@example.com';
const ADMIN_PASSWORD = 'Test1234!';
const GYM_SLUG = 'downtown';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
const STORAGE_STATE = resolve(dirname(fileURLToPath(import.meta.url)), '.auth/storage-state.json');

/**
 * The admin console has no sign-in page — the web app owns login and drops an
 * `accessToken` cookie the admin middleware reads. We reproduce that here: mint
 * a real gym-scoped OWNER token via the API's `POST /auth/login`, then write a
 * Playwright storage state carrying that cookie (plus `NEXT_LOCALE=en` so the
 * UI renders the English strings the tests assert on). Cookies are host-only on
 * `localhost`, which is shared across ports, so the admin app on :3002 reads the
 * token minted against the API on :3000.
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  const api = await request.newContext({ baseURL: API_URL });

  const res = await api.post('/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, gymSlug: GYM_SLUG },
  });

  if (!res.ok()) {
    throw new Error(
      `Admin login failed (${res.status()}). Is the database seeded? ` +
        `Run \`pnpm db:migrate && pnpm db:seed\` before the e2e suite.\n${await res.text()}`,
    );
  }

  const { accessToken } = (await res.json()) as { accessToken?: string };
  if (!accessToken) {
    throw new Error('Login succeeded but returned no accessToken.');
  }

  const cookieBase = {
    domain: 'localhost',
    path: '/',
    // Session cookie — lives for the browser context, well within the token TTL.
    expires: -1,
    secure: false,
    sameSite: 'Lax' as const,
  };

  const storageState = {
    cookies: [
      { name: 'accessToken', value: accessToken, httpOnly: true, ...cookieBase },
      { name: 'NEXT_LOCALE', value: 'en', httpOnly: false, ...cookieBase },
    ],
    origins: [],
  };

  await mkdir(dirname(STORAGE_STATE), { recursive: true });
  await writeFile(STORAGE_STATE, JSON.stringify(storageState, null, 2));
  await api.dispose();
}

export default globalSetup;
