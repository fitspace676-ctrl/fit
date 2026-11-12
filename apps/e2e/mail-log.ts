import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';

/**
 * Where `playwright.new-gym.config.ts` sends the API's stdout + stderr.
 *
 * This is the suite's mailbox. With `RESEND_API_KEY` unset — as it is in CI and in
 * every E2E run — `EmailService` sends nothing and logs each mail's link instead
 * (`Resend not configured (RESEND_API_KEY unset) — owner onboarding link for <to>:
 * <url>`). Reading that line back is how a test "opens its email": it gets the
 * exact URL the API built, host and all, without a test-only route in the API or
 * a peek at the Redis key the token hides behind.
 *
 * Outside `test-results/` on purpose: Playwright empties that directory after the
 * web servers have started, which would unlink the file the API is writing to.
 */
export const API_LOG_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '.logs/api.log');

/** An ANSI colour sequence, in case the logger colours its output after all. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** Every absolute http(s) URL on a line. */
const URLS = /https?:\/\/[^\s"'<>]+/g;

/**
 * The newest link to `pathname` logged for `recipient`, or `undefined`. A
 * `pathname` ending in `/` is a prefix — the onboarding link carries its token as
 * the last path segment (`/admin/onboarding/<token>`), not in the query.
 */
function lastLoggedLink(log: string, recipient: string, pathname: string): string | undefined {
  const matches = (path: string): boolean =>
    pathname.endsWith('/') ? path.startsWith(pathname) : path === pathname;
  const lines = log.replace(ANSI, '').split('\n').reverse();
  for (const line of lines) {
    if (!line.includes(recipient)) continue;
    const link = line.match(URLS)?.find((url) => matches(new URL(url).pathname));
    if (link) return link;
  }
  return undefined;
}

/**
 * Wait for the API to "mail" `recipient` a link to `pathname`, and return it.
 * Polls, because the logger flushes on its own schedule.
 */
export async function mailedLink(recipient: string, pathname: string): Promise<URL> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const log = await readFile(API_LOG_FILE, 'utf8').catch(() => '');
        link = lastLoggedLink(log, recipient, pathname);
        return link ?? null;
      },
      {
        message: `a ${pathname} link logged for ${recipient} in ${API_LOG_FILE}`,
        timeout: 20_000,
      },
    )
    .not.toBeNull();
  return new URL(link!);
}

/** The newest six-digit onboarding code mailed to this exact recipient. */
export async function mailedCode(recipient: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const log = await readFile(API_LOG_FILE, 'utf8').catch(() => '');
        const prefix = `Resend not configured (RESEND_API_KEY unset) — onboarding code for ${recipient}: `;
        const line = log
          .replace(ANSI, '')
          .split('\n')
          .reverse()
          .find((line) => line.includes(prefix));
        code = line?.slice(line.indexOf(prefix) + prefix.length).match(/^(\d{6})(?:\s|$)/)?.[1];
        return code ?? null;
      },
      { message: `an onboarding code logged for ${recipient} in ${API_LOG_FILE}`, timeout: 20_000 },
    )
    .not.toBeNull();
  return code!;
}
