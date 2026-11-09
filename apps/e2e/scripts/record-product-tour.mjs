// Records the marketing site's product-tour clips (apps/platform/public/tour/).
//
// Five short scenes, each in the light and the dark theme and in both UI
// languages (`ka` for the Georgian site, `en` for every other locale), driven
// through the real admin console and member portal of the seeded `downtown`
// demo gym: `<scene>-<light|dark>-<en|ka>[-m].{mp4,webp}`. Frames
// come from Chrome's screencast (sharper than Playwright's built-in recorder) and
// a drawn cursor is injected so the viewer can follow the clicks; ffmpeg turns
// the frames into an H.264 mp4, a half-size phone mp4 and WebP posters per clip.
//
// Needs the local stack running (api :3000, web :3001, admin :3002), a seeded
// database (`pnpm db:seed` and `pnpm db:generate-instances`), system Chrome and
// ffmpeg. Run from the repo root:
//
//   node apps/e2e/scripts/record-product-tour.mjs                 # every clip
//   node apps/e2e/scripts/record-product-tour.mjs members         # filter by any of
//   node apps/e2e/scripts/record-product-tour.mjs dashboard ka    #   scene, light|dark, en|ka
//
// A full, unfiltered run also deletes the old unsuffixed `<scene>-<theme>[-m]`
// files if they are still there.
//
// The logins are the seed's public dev fixtures, never real credentials.

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const OUT = join(ROOT, 'apps/platform/public/tour');
const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:3002/admin';
const WEB = process.env.WEB_URL ?? 'http://localhost:3001';
const STAFF = { email: 'manager@downtown.demo', password: 'Test1234!' };
const MEMBER = { email: 'sam@example.com', password: 'Test1234!' };

const DESKTOP = { width: 1280, height: 800, scale: 1.5 };
const PHONE = { width: 390, height: 844, scale: 2 };

const THEMES = ['light', 'dark'];
const LOCALES = ['en', 'ka'];

/** Labels the scenes click on or wait for, where no language-neutral handle exists. */
const LABELS = {
  en: {
    agent: 'AI Agent',
    month: 'This Month',
    weeks: '12w',
    last12: /Last 12 weeks/,
    next: 'Next',
    reportsMembers: /^Members\s*\d/,
    atRisk: 'Retention & engagement',
    loadingClasses: /Loading classes/,
    list: 'List',
    book: /^Book/,
  },
  ka: {
    agent: 'AI აგენტი',
    month: 'ამ თვეში',
    weeks: '12კვ',
    last12: /ბოლო 12 კვირა/,
    next: 'შემდეგი',
    reportsMembers: /^წევრები\s*\d/,
    atRisk: 'შენარჩუნება და ჩართულობა',
    loadingClasses: /იტვირთება|ჩატვირთვა/,
    list: 'სია',
    book: /დაჯავშნა/,
  },
};

/** Test runs leave classes and products behind ("E2E …", "rtests"); keep them off camera. */
const isLeftover = (x) =>
  x && typeof x === 'object' && /^E2E\b|test/i.test(String(x.title ?? x.name ?? ''));
const dropLeftovers = (v) =>
  Array.isArray(v)
    ? v.filter((x) => !isLeftover(x)).map(dropLeftovers)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dropLeftovers(x)]))
      : v;

/** A drawn pointer (desktop) or touch dot (phone) that follows the mouse. */
const cursorScript = (kind, agentLabel) => `
  addEventListener('DOMContentLoaded', () => {
    // Hide the Next.js dev-tools badge, which only exists on the dev server.
    const hide = document.createElement('style');
    hide.textContent = 'nextjs-portal{display:none!important}';
    document.head.appendChild(hide);
    // The console's floating "AI Agent" launcher sits over every screen; each
    // scene is about something else, so keep it out of the shot.
    const sweep = () => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent && b.textContent.trim() === ${JSON.stringify(agentLabel)}) b.style.visibility = 'hidden';
        // The portal renders its class list on the server, out of reach of the
        // route filter below, so hide test-run leftovers' cards here instead.
        if (b.innerText && b.innerText.split('\\n').some((l) => /^(rtests|E2E\\b.*)$/.test(l.trim()))) b.style.display = 'none';
      }
    };
    sweep();
    new MutationObserver(sweep).observe(document.body, { childList: true, subtree: true });
    const c = document.createElement('div');
    c.id = '__tour_cursor';
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

/** Glide the pointer to the middle of `locator`, so the move is visible on film. */
async function glide(page, locator, steps = 28) {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  // Bring it on screen first: a click aimed past the viewport lands on whatever
  // is there instead (a dialog's backdrop, which closes it).
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
  await page.waitForTimeout(250);
}

/** One real click where the drawn pointer is, so what the film shows is what happens. */
async function tap(page, locator) {
  await glide(page, locator);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
}

async function typeSlow(page, text, delay = 110) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(delay);
  }
}

const SCENES = {
  members: {
    frame: 'desktop',
    async setup(page) {
      await page.goto(`${ADMIN}/members`, { waitUntil: 'networkidle' });
    },
    async play(page) {
      await page.mouse.move(900, 640);
      await page.waitForTimeout(700);
      const search = page.locator('input[type="search"], input[placeholder*="earch"]').first();
      await tap(page, search);
      await typeSlow(page, 'Ana');
      await page.waitForTimeout(900);
      const row = page.getByText('Ana Dolidze').first();
      await tap(page, row);
      await page.waitForURL(/\/members\/[^/]+$/, { timeout: 10000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2200);
    },
  },
  schedule: {
    frame: 'desktop',
    async setup(page) {
      await page.goto(`${ADMIN}/classes`, { waitUntil: 'networkidle' });
    },
    async play(page, L) {
      await page.mouse.move(700, 300);
      await page.waitForTimeout(600);
      await tap(page, page.getByRole('tab').nth(1));
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(900);
      // The seeded timetable starts today, so step to the full week ahead.
      await tap(page, page.getByRole('button', { name: L.next, exact: true }));
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const block = page
        .getByRole('button', { name: /Yoga|Spin|CrossFit|Boxing|Pilates|ballet/ })
        .nth(3);
      await block.scrollIntoViewIfNeeded();
      await glide(page, block, 36);
      await page.waitForTimeout(500);
      await tap(page, block);
      await page.waitForTimeout(2400);
    },
  },
  dashboard: {
    frame: 'desktop',
    async setup(page) {
      await page.goto(`${ADMIN}/`, { waitUntil: 'networkidle' });
    },
    async play(page, L) {
      await page.mouse.move(820, 300);
      await page.waitForTimeout(600);
      await tap(page, page.getByRole('radio', { name: L.month, exact: true }));
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(700);
      await tap(page, page.getByText(L.weeks, { exact: true }));
      await page.waitForTimeout(900);
      // Sweep along the revenue curve so its tooltip follows the pointer.
      // The chart sits under its "Last 12 weeks" caption, across the card.
      const caption = await page.getByText(L.last12).first().boundingBox();
      if (caption) {
        const y = caption.y + 110;
        await page.mouse.move(caption.x + 20, y, { steps: 20 });
        await page.mouse.move(caption.x + 560, y, { steps: 70 });
      }
      await page.waitForTimeout(1400);
    },
  },
  reports: {
    frame: 'desktop',
    async setup(page) {
      await page.goto(`${ADMIN}/reports`, { waitUntil: 'networkidle' });
    },
    async play(page, L) {
      await page.mouse.move(700, 420);
      await page.waitForTimeout(600);
      await tap(page, page.getByText(L.reportsMembers).first());
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      await tap(page, page.getByText(L.atRisk).first());
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(900);
      // Read down the list of members who need attention.
      const row = page.getByText('Ana Dolidze').first();
      await glide(page, row, 26);
      await page.mouse.move(520, 720, { steps: 40 });
      await page.waitForTimeout(500);
      const csv = page.getByText('CSV', { exact: true }).first();
      await glide(page, csv, 30);
      await page.waitForTimeout(1200);
    },
  },
  portal: {
    frame: 'desktop',
    member: true,
    async setup(page, locale) {
      await page.goto(`${WEB}/${locale}/member/classes`, { waitUntil: 'networkidle' });
    },
    async play(page, L) {
      await page.mouse.move(640, 300);
      await page.waitForTimeout(700);
      await page.getByText(L.loadingClasses).waitFor({ state: 'hidden', timeout: 15000 });
      await tap(page, page.getByText(L.list, { exact: true }).first());
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // A class card's accessible name starts with its start time (`16:00…`).
      // Skip a full class: its detail offers the waitlist, not Book.
      await tap(
        page,
        page
          .getByRole('button', { name: /^\d{2}:\d{2}/ })
          .filter({ hasNotText: /100%|rtests/ })
          .first(),
      );
      await page.waitForTimeout(1200);
      const book = page.getByRole('button', { name: L.book }).last();
      await glide(page, book, 26);
      await page.waitForTimeout(1600);
    },
  },
};

async function signIn(browser) {
  const staff = await browser.newContext();
  const sp = await staff.newPage();
  await sp.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' });
  await sp.fill('input[type=email]', STAFF.email);
  await sp.fill('input[type=password]', STAFF.password);
  await sp.locator('button[type=submit]').click();
  await sp.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 });
  const staffState = await staff.storageState();
  await staff.close();

  const member = await browser.newContext();
  const mp = await member.newPage();
  await mp.goto(`${WEB}/en/member/login`, { waitUntil: 'networkidle' });
  await mp.fill('input[type=email]', MEMBER.email);
  await mp.fill('input[type=password]', MEMBER.password);
  await mp.keyboard.press('Enter');
  await mp.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 });
  const memberState = await member.storageState();
  await member.close();
  return { staffState, memberState };
}

async function record(browser, name, theme, locale, states) {
  const scene = SCENES[name];
  const size = scene.frame === 'phone' ? PHONE : DESKTOP;
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
    colorScheme: theme,
    isMobile: scene.frame === 'phone',
    hasTouch: false,
    locale: locale === 'ka' ? 'ka-GE' : 'en-US',
    storageState: scene.member ? states.memberState : states.staffState,
  });
  for (const url of [ADMIN, WEB]) {
    await context.addCookies([
      { name: 'theme', value: theme, url },
      { name: 'NEXT_LOCALE', value: locale, url },
    ]);
  }
  await context.route(/\/(class-instances|products)(\/[^/?]*)?(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    try {
      body = JSON.stringify(dropLeftovers(JSON.parse(body)));
    } catch {
      // not JSON: pass it through
    }
    await route.fulfill({ response, body });
  });
  await context.addInitScript(cursorScript(scene.frame, LABELS[locale].agent));
  const page = await context.newPage();
  await scene.setup(page, locale);
  await page.waitForTimeout(1200);

  const dir = mkdtempSync(join(tmpdir(), `tour-${name}-${theme}-${locale}-`));
  const frames = [];
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', async (f) => {
    const file = join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  // The screencast fits frames into the window's outer size unless told the
  // viewport's real pixel size, which crops a phone and squashes a desktop.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: size.width,
    height: size.height,
    deviceScaleFactor: size.scale,
    mobile: scene.frame === 'phone',
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: Math.round(size.width * size.scale),
    maxHeight: Math.round(size.height * size.scale),
  });
  await page.waitForTimeout(400);
  await scene.play(page, LABELS[locale]);
  await cdp.send('Page.stopScreencast');
  await context.close();
  encode(name, `${name}-${theme}-${locale}`, frames, dir);
  rmSync(dir, { recursive: true, force: true });
}

function encode(name, id, frames, dir) {
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

  const base = join(OUT, id);
  // Every clip comes out at its device's exact shape (16:10 desktop, 390:844
  // phone), whatever size the screencast delivered.
  const phone = SCENES[name].frame === 'phone';
  const target = phone ? PHONE : DESKTOP;
  const w = Math.round((target.width * (phone ? 1.5 : 1.25)) / 2) * 2;
  const h = Math.round((w * target.height) / target.width / 2) * 2;
  const even = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:0:0,fps=30`;
  const run = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  run([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    list,
    '-vf',
    even,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '24',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    `${base}.mp4`,
  ]);
  // The phone cut: half size, a third of the bytes, served below 768px. No VP9
  // webm: on these recordings it came out no smaller than H.264.
  run([
    '-i',
    `${base}.mp4`,
    '-vf',
    'scale=trunc(iw/4)*2:-2',
    '-c:v',
    'libx264',
    '-preset',
    'veryslow',
    '-crf',
    '27',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    `${base}-m.mp4`,
  ]);
  // Posters as WebP (full and half size). The bundled ffmpeg has no WebP
  // encoder, so a PNG frame goes through `cwebp` (brew install webp).
  const frame = `${base}.poster.png`;
  run(['-ss', '0.3', '-i', `${base}.mp4`, '-frames:v', '1', frame]);
  execFileSync('cwebp', ['-quiet', '-q', '80', frame, '-o', `${base}.webp`]);
  execFileSync('cwebp', [
    '-quiet',
    '-q',
    '80',
    '-resize',
    String(w / 2),
    '0',
    frame,
    '-o',
    `${base}-m.webp`,
  ]);
  rmSync(frame);
  console.log(`${id}: ${frames.length} frames`);
}

const args = process.argv.slice(2);
const pick = (all) => {
  const chosen = all.filter((v) => args.includes(v));
  return chosen.length ? chosen : all;
};
const names = pick(Object.keys(SCENES));
const themes = pick(THEMES);
const locales = pick(LOCALES);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const states = await signIn(browser);
for (const name of names) {
  for (const theme of themes) {
    for (const locale of locales) await record(browser, name, theme, locale, states);
  }
}
await browser.close();

if (args.length === 0) {
  for (const old of readdirSync(OUT)) {
    if (/^[a-z]+-(light|dark)(-m)?\.(mp4|webp)$/.test(old)) {
      rmSync(join(OUT, old));
      console.log(`removed old ${old}`);
    }
  }
}
