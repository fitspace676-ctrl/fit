// Records the marketing landing's hero screens (apps/platform/public/hero/).
//
// Two recordings — the staff console's Dashboard on the laptop and the member
// app's Home → Classes → Book → Shop loop on the phone — each in the light and
// the dark theme and in both UI languages, so the Georgian landing (/ka) shows
// the Georgian product and the English landing shows the English one:
//
//   {admin,app}-{light,dark}-{en,ka}.mp4   H.264, 30fps, +faststart, no audio
//   {admin,app}-{light,dark}-{en,ka}.webp  the poster / phone still (first frame)
//
// admin comes out 960x600 (a 1280x800 console viewport), app 360x780 (a bare
// 390x844 phone viewport with no status bar — the landing's phone frame draws
// its own). `hero-devices.tsx` picks `${name}-${theme}-${locale}`.
//
// Frames come from Chrome's screencast (same approach as record-product-tour.mjs)
// with a drawn pointer / touch dot so the viewer can follow the clicks; ffmpeg
// turns them into the mp4 and the webp, and prints a contact sheet per clip into
// a temp folder so the result can be eyeballed without opening the site.
//
// Needs, running locally against a seeded database (`pnpm db:seed`):
//   api    :3000   pnpm --filter @fit/api dev
//   admin  :3002   pnpm --filter @fit/admin dev
//   mobile :8081   cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:3000 \
//                    EXPO_PUBLIC_GYM_SLUG=downtown pnpm exec expo start --web
// plus system Chrome and ffmpeg (/opt/homebrew/bin or on PATH). Run from the
// repo root:
//
//   node apps/e2e/scripts/record-hero.mjs                 # all 16 files
//   node apps/e2e/scripts/record-hero.mjs app ka          # filter by any of
//   node apps/e2e/scripts/record-hero.mjs admin dark en   #   admin|app light|dark en|ka
//
// A full, unfiltered run that produced every file also deletes the old
// unsuffixed `{admin,app}-{light,dark}.{mp4,webp}` if they are still there.
//
// The logins are the seed's public dev fixtures, never real credentials. Booking
// a class on the phone is a real booking for sam@example.com; the script picks
// the first class that is still bookable, so re-runs keep working.

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const OUT = join(ROOT, 'apps/platform/public/hero');
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3002/admin';
const MOBILE = process.env.MOBILE_URL ?? 'http://localhost:8081';
const FFMPEG =
  process.env.FFMPEG ??
  (existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
const STAFF = { email: 'manager@downtown.demo', password: 'Test1234!' };
// A Premium demo member, so Home shows a live membership and Book succeeds. The
// seed gives demo members no password; give this one the shared dev password
// locally (a gym_credentials row with the seed's DEV_PASSWORD_HASH) first.
const MEMBER = {
  email: 'giorgi.beridze@downtown.demo',
  password: 'Test1234!',
  gymSlug: 'downtown',
};

const BRAND_BLUE = '#1a7fd6';
const NAMES = ['admin', 'app'];
const THEMES = ['light', 'dark'];
const LOCALES = ['en', 'ka'];

/** Viewport each screen is driven at, and the exact size its files come out at. */
const SCREENS = {
  admin: {
    viewport: { width: 1280, height: 800 },
    scale: 1.5,
    out: { width: 960, height: 600 },
    mobile: false,
  },
  app: {
    viewport: { width: 390, height: 844 },
    scale: 2,
    out: { width: 360, height: 780 },
    mobile: true,
  },
};

/** Labels the flows click on, where no language-neutral handle exists. */
const LABELS = {
  en: { month: 'This Month', today: 'Today', agent: 'AI Agent', book: 'Book' },
  ka: { month: 'ამ თვეში', today: 'დღეს', agent: 'AI აგენტი', book: 'დაჯავშნა' },
};

/** A drawn pointer (console) or touch dot (phone) that follows the mouse. */
const cursorScript = (kind, agentLabel) => `
  addEventListener('DOMContentLoaded', () => {
    const hide = document.createElement('style');
    hide.textContent = 'nextjs-portal{display:none!important}';
    document.head.appendChild(hide);
    const sweep = () => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent && b.textContent.trim() === ${JSON.stringify(agentLabel)}) b.style.visibility = 'hidden';
      }
    };
    sweep();
    new MutationObserver(sweep).observe(document.body, { childList: true, subtree: true });
    const c = document.createElement('div');
    c.id = '__hero_cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:transform .12s ease-out;will-change:transform;';
    c.innerHTML = ${JSON.stringify(
      kind === 'phone'
        ? '<div style="width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(26,127,214,.28);border:2px solid rgba(255,255,255,.9);box-shadow:0 4px 14px rgba(2,11,46,.35)"></div>'
        : '<svg width="26" height="26" viewBox="0 0 24 24" style="filter:drop-shadow(0 3px 6px rgba(2,11,46,.45))"><path d="M4 2l15 11-7 1.2L8.6 21z" fill="#fff" stroke="#0b1b3a" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    )};
    c.style.opacity = '0';
    document.body.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.opacity = '1'; c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
    addEventListener('mousedown', () => { c.firstElementChild.style.transform = 'scale(.82)'; }, true);
    addEventListener('mouseup', () => { c.firstElementChild.style.transform = ''; }, true);
  });
`;

/** The member app keeps its language and theme in AsyncStorage, which is localStorage on web. */
const mobilePrefsScript = (locale, theme) => `
  try {
    localStorage.setItem('app_locale', ${JSON.stringify(locale)});
    localStorage.setItem('app_theme', ${JSON.stringify(theme)});
  } catch {}
`;

async function glide(page, locator, steps = 28) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
  await page.waitForTimeout(250);
}

async function tap(page, locator) {
  await glide(page, locator);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

/** Scroll by `distance` px in small wheel ticks, so the film shows motion rather than a jump. */
async function wheel(page, distance, ticks = 18) {
  const step = distance / ticks;
  for (let i = 0; i < ticks; i += 1) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(45);
  }
}

const FLOWS = {
  /**
   * Staff console Dashboard, "All locations", Overview tab: the Today view,
   * switch to This Month, hover along the revenue chart, scroll down to Today's
   * schedule and the alerts, scroll back and return to Today so the loop closes.
   */
  async admin(page, locale) {
    const L = LABELS[locale];
    // The Dashboard is already loaded (see `record`), so the first frame is it.
    await page.mouse.move(900, 620);
    await page.waitForTimeout(2200);

    // The period control lives in the page header, which keeps "Today" from
    // matching the schedule card's title or a date label further down.
    const header = page
      .locator('header')
      .filter({ has: page.locator('h1') })
      .first();
    await tap(page, header.getByText(L.month, { exact: true }));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1600);

    // The revenue card is the first chart on Overview; sweep along it so its
    // tooltip follows the pointer.
    // The first wide `role="img"` is the revenue chart (the gauges are small).
    let box = null;
    for (let tries = 0; !box && tries < 30; tries += 1) {
      for (const el of await page.locator('[role="img"]').all()) {
        const b = await el.boundingBox();
        if (b && b.width > 300) {
          box = b;
          break;
        }
      }
      if (!box) await page.waitForTimeout(500);
    }
    if (!box) console.warn('revenue chart not found; skipping the chart sweep');
    if (box) {
      const y = box.y + box.height * 0.45;
      await page.mouse.move(box.x + 16, y, { steps: 24 });
      await page.mouse.move(box.x + box.width - 16, y, { steps: 80 });
      await page.waitForTimeout(600);
      await page.mouse.move(box.x + box.width * 0.6, y, { steps: 30 });
    }
    await page.waitForTimeout(1200);

    await wheel(page, 560);
    await page.waitForTimeout(2600);
    await wheel(page, -560);
    await page.waitForTimeout(700);

    await tap(page, header.getByText(L.today, { exact: true }));
    await page.waitForLoadState('networkidle');
    await page.mouse.move(900, 620, { steps: 20 });
    await page.waitForTimeout(1800);
  },

  /**
   * Member app: Home (welcome, banner, membership card) scrolled, the Classes
   * tab, Book on the first bookable class (the "You're booked!" toast), the Shop
   * tab, then Home again so the loop closes.
   */
  async app(page, locale) {
    const L = LABELS[locale];
    await page.getByTestId('home-screen').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(600);
    await page.mouse.move(195, 520);
    await page.waitForTimeout(1800);
    await wheel(page, 520, 22);
    await page.waitForTimeout(1200);
    await wheel(page, -520, 22);
    await page.waitForTimeout(600);

    await tap(page, page.getByTestId('tab-classes'));
    await page.getByTestId('classes-screen').waitFor({ state: 'visible', timeout: 20000 });
    await page
      .getByTestId('classes-loading')
      .waitFor({ state: 'hidden', timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(1500);

    // The first class that still takes a booking: today's if any is left, else
    // the next day's (earlier runs book today's up, so re-runs move along).
    const book = page
      .locator('[data-testid^="classes-card-"][data-testid$="-action"]')
      .filter({ hasText: new RegExp(`^${L.book}$`) })
      .first();
    const days = page.locator('[data-testid^="classes-day-"]');
    for (let d = 1; d < 7 && !(await book.isVisible().catch(() => false)); d += 1) {
      if (d >= (await days.count())) break;
      await tap(page, days.nth(d));
      await page.waitForTimeout(1400);
    }
    // Centre it first: scrolled only into view, it can sit under the floating
    // tab bar, and the tap lands on the bar instead.
    await book.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await page.waitForTimeout(700);
    await tap(page, book);
    // Booking asks for a confirmation in a sheet first.
    await page.waitForTimeout(900);
    await tap(page, page.getByTestId('class-booking-confirm-confirm'));
    await page.waitForTimeout(3200);

    await tap(page, page.getByTestId('tab-shop'));
    await page.getByTestId('shop-screen').waitFor({ state: 'visible', timeout: 20000 });
    await page
      .getByTestId('shop-loading')
      .waitFor({ state: 'hidden', timeout: 20000 })
      .catch(() => {});
    await page.mouse.move(195, 560, { steps: 20 });
    await page.waitForTimeout(2600);

    await tap(page, page.getByTestId('tab-home'));
    await page.getByTestId('home-screen').waitFor({ state: 'visible', timeout: 20000 });
    await page.mouse.move(195, 520, { steps: 20 });
    await page.waitForTimeout(1400);
  },
};

/** Sign the staff member into the console once; the storage state is reused per clip. */
async function staffState(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', STAFF.email);
  await page.fill('input[type=password]', STAFF.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 });
  const state = await context.storageState();
  await context.close();
  return state;
}

/** Sign the member into the Expo web app inside `page` (the session lives in localStorage). */
async function memberSignIn(page, locale, theme) {
  await page.goto(`${MOBILE}/`, { waitUntil: 'networkidle' });
  if (
    await page
      .getByTestId('home-screen')
      .isVisible()
      .catch(() => false)
  )
    return;
  const email = page.getByTestId('login-email-input');
  await email.waitFor({ state: 'visible', timeout: 60000 });
  await email.fill(MEMBER.email);
  await page.getByTestId('login-password-input').fill(MEMBER.password);
  await page.getByTestId('login-submit').click();
  // A member of several gyms is asked which one; sam has one, but be safe.
  const picker = page.getByTestId(`login-gym-${MEMBER.gymSlug}`);
  await Promise.race([
    page.getByTestId('home-screen').waitFor({ state: 'visible', timeout: 30000 }),
    picker.waitFor({ state: 'visible', timeout: 30000 }).then(() => picker.click()),
  ]).catch(() => {});
  // A first sign-in on this browser opens the onboarding tour; skip it.
  const skip = page.getByTestId('onboarding-skip');
  if (await skip.isVisible({ timeout: 5000 }).catch(() => false)) await skip.click();
  await page.getByTestId('home-screen').waitFor({ state: 'visible', timeout: 30000 });

  // The web build does not read a stored language back on load, so pick the
  // language and theme with the app's own switches on Profile, off camera.
  await page.getByTestId('tab-profile').click();
  await page.getByTestId(`profile-language-${locale}`).click();
  await page.getByTestId(`profile-appearance-${theme}`).click();
  await page.getByTestId('tab-home').click();
  await page.getByTestId('home-screen').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function record(browser, name, theme, locale, state) {
  const screen = SCREENS[name];
  const context = await browser.newContext({
    viewport: screen.viewport,
    deviceScaleFactor: screen.scale,
    colorScheme: theme,
    isMobile: screen.mobile,
    hasTouch: false,
    locale: locale === 'ka' ? 'ka-GE' : 'en-US',
    storageState: name === 'admin' ? state : undefined,
  });
  if (name === 'admin') {
    await context.addCookies([
      { name: 'theme', value: theme, url: ADMIN },
      { name: 'NEXT_LOCALE', value: locale, url: ADMIN },
    ]);
  } else {
    await context.addInitScript(mobilePrefsScript(locale, theme));
    // Film the app in the FormaCore blue whatever accent the local demo gym
    // carries, so the hero matches the site around it.
    await context.route(/\/gyms\/by-subdomain\/[^/?]+(\/app-settings)?(\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /"primaryColor":"#[0-9a-fA-F]{6}"/g,
        `"primaryColor":"${BRAND_BLUE}"`,
      );
      await route.fulfill({ response, body });
    });
    // Leave out the products end-to-end test runs leave behind ("E2E Day Pass …").
    await context.route(/\/products(\?.*)?$/, async (route) => {
      const response = await route.fetch();
      let body = await response.text();
      try {
        const drop = (v) =>
          Array.isArray(v)
            ? v
                .filter((x) => !(x && typeof x === 'object' && /^E2E\b/.test(x.name ?? '')))
                .map(drop)
            : v && typeof v === 'object'
              ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, drop(x)]))
              : v;
        body = JSON.stringify(drop(JSON.parse(body)));
      } catch {
        // not JSON: pass it through
      }
      await route.fulfill({ response, body });
    });
    // Same for the classes test runs leave on the schedule ("rtests", "E2E …").
    await context.route(/\/class-instances(\?.*)?$/, async (route) => {
      const response = await route.fetch();
      let body = await response.text();
      try {
        const data = JSON.parse(body);
        if (Array.isArray(data.instances)) {
          data.instances = data.instances.filter((c) => !/^E2E\b|test/i.test(c.title ?? ''));
        }
        body = JSON.stringify(data);
      } catch {
        // not JSON: pass it through
      }
      await route.fulfill({ response, body });
    });
  }
  await context.addInitScript(
    cursorScript(screen.mobile ? 'phone' : 'desktop', LABELS[locale].agent),
  );
  const page = await context.newPage();
  // Load the first screen before filming starts: the first frame is the poster
  // and the point the loop restarts from, so it must not be a blank page.
  if (name === 'app') await memberSignIn(page, locale, theme);
  else {
    await page.goto(`${ADMIN}/?period=today`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
  }

  const dir = mkdtempSync(join(tmpdir(), `hero-${name}-${theme}-${locale}-`));
  const frames = [];
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', async (f) => {
    const file = join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: screen.viewport.width,
    height: screen.viewport.height,
    deviceScaleFactor: screen.scale,
    mobile: screen.mobile,
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: Math.round(screen.viewport.width * screen.scale),
    maxHeight: Math.round(screen.viewport.height * screen.scale),
  });
  await page.waitForTimeout(400);
  await FLOWS[name](page, locale);
  await cdp.send('Page.stopScreencast');
  await context.close();
  const result = encode(name, theme, locale, frames, dir);
  rmSync(dir, { recursive: true, force: true });
  return result;
}

const ffmpeg = (args) =>
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

function encode(name, theme, locale, frames, dir) {
  const id = `${name}-${theme}-${locale}`;
  if (frames.length < 2) throw new Error(`${id}: no frames captured`);
  // The screencast only emits a frame when something changes, so each frame is
  // held until the next one's timestamp.
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? f.t + 0.6;
    lines.push(`file '${f.file}'`, `duration ${Math.max(next - f.t, 0.001).toFixed(4)}`);
  });
  lines.push(`file '${frames.at(-1).file}'`);
  const list = join(dir, 'frames.txt');
  writeFileSync(list, lines.join('\n'));

  const { width: w, height: h } = SCREENS[name].out;
  const base = join(OUT, id);
  const fit = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:0:0,fps=30`;
  ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-vf',
    fit,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '26',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    `${base}.mp4`,
  ]);

  // The poster is the first frame, which is also where the loop restarts.
  try {
    ffmpeg([
      '-i',
      `${base}.mp4`,
      '-frames:v',
      '1',
      '-c:v',
      'libwebp',
      '-quality',
      '82',
      `${base}.webp`,
    ]);
  } catch {
    // An ffmpeg without libwebp: go through a PNG and `cwebp` (brew install webp).
    const png = `${base}.poster.png`;
    ffmpeg(['-i', `${base}.mp4`, '-frames:v', '1', png]);
    execFileSync('cwebp', ['-quiet', '-q', '82', png, '-o', `${base}.webp`]);
    rmSync(png);
  }

  // A contact sheet of 8 frames spread over the clip, for a quick look.
  const sheet = join(SHEETS, `${id}.png`);
  const duration = frames.at(-1).t - frames[0].t + 0.6;
  const every = Math.max(duration / 8, 0.5);
  ffmpeg([
    '-i',
    `${base}.mp4`,
    '-vf',
    `fps=1/${every.toFixed(3)},scale=${Math.round(w / 2)}:-2,tile=4x2`,
    '-frames:v',
    '1',
    sheet,
  ]);

  const size = (p) => `${Math.round(statSync(p).size / 1024)}KB`;
  console.log(
    `${id}: ${frames.length} frames, ${duration.toFixed(1)}s, mp4 ${size(`${base}.mp4`)}, webp ${size(`${base}.webp`)}, sheet ${sheet}`,
  );
  return id;
}

async function assertUp(url, what) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
  } catch (error) {
    throw new Error(
      `${what} is not reachable at ${url} (${error.message ?? error}). See the header of this script for how to start it.`,
    );
  }
}

const args = process.argv.slice(2);
const pick = (all) => {
  const chosen = all.filter((v) => args.includes(v));
  return chosen.length ? chosen : all;
};
const names = pick(NAMES);
const themes = pick(THEMES);
const locales = pick(LOCALES);
const SHEETS = mkdtempSync(join(tmpdir(), 'hero-sheets-'));

if (names.includes('admin')) await assertUp(`${ADMIN}/login`, 'The admin console');
if (names.includes('app')) await assertUp(`${MOBILE}/`, 'The member app (expo web)');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const staff = names.includes('admin') ? await staffState(browser) : null;
const made = [];
for (const name of names) {
  for (const theme of themes) {
    for (const locale of locales) made.push(await record(browser, name, theme, locale, staff));
  }
}
await browser.close();

if (made.length === NAMES.length * THEMES.length * LOCALES.length) {
  for (const old of readdirSync(OUT)) {
    if (/^(admin|app)-(light|dark)\.(mp4|webp)$/.test(old)) {
      rmSync(join(OUT, old));
      console.log(`removed old ${old}`);
    }
  }
}
console.log(`contact sheets: ${SHEETS}`);
