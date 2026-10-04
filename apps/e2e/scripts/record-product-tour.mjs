// Records the marketing site's product-tour clips (apps/platform/public/tour/).
//
// Five short scenes, each in the light and the dark theme, driven through the
// real admin console and member portal of the seeded `downtown` demo gym. Frames
// come from Chrome's screencast (sharper than Playwright's built-in recorder) and
// a drawn cursor is injected so the viewer can follow the clicks; ffmpeg turns
// the frames into an H.264 mp4, a VP9 webm and a JPEG poster per clip.
//
// Needs the local stack running (api :3000, web :3001, admin :3002), a seeded
// database (`pnpm db:seed` and `pnpm db:generate-instances`), system Chrome and
// ffmpeg. Run from the repo root:
//
//   node apps/e2e/scripts/record-product-tour.mjs            # every scene
//   node apps/e2e/scripts/record-product-tour.mjs members    # just one
//
// The logins are the seed's public dev fixtures, never real credentials.

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

/** A drawn pointer (desktop) or touch dot (phone) that follows the mouse. */
const cursorScript = (kind) => `
  addEventListener('DOMContentLoaded', () => {
    // Hide the Next.js dev-tools badge, which only exists on the dev server.
    const hide = document.createElement('style');
    hide.textContent = 'nextjs-portal{display:none!important}';
    document.head.appendChild(hide);
    // The console's floating "AI Agent" launcher sits over every screen; each
    // scene is about something else, so keep it out of the shot.
    const sweep = () => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent && b.textContent.trim() === 'AI Agent') b.style.visibility = 'hidden';
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
    async play(page) {
      await page.mouse.move(700, 300);
      await page.waitForTimeout(600);
      await tap(page, page.getByRole('tab').nth(1));
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(900);
      // The seeded timetable starts today, so step to the full week ahead.
      await tap(page, page.getByRole('button', { name: 'Next', exact: true }));
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
    async play(page) {
      await page.mouse.move(820, 300);
      await page.waitForTimeout(600);
      await tap(page, page.getByText('This Month', { exact: true }));
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(700);
      await tap(page, page.getByText('12w', { exact: true }));
      await page.waitForTimeout(900);
      // Sweep along the revenue curve so its tooltip follows the pointer.
      // The chart sits under its "Last 12 weeks" caption, across the card.
      const caption = await page
        .getByText(/Last 12 weeks/)
        .first()
        .boundingBox();
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
    async play(page) {
      await page.mouse.move(700, 420);
      await page.waitForTimeout(600);
      await tap(page, page.getByText(/^Members\s*\d/).first());
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      await tap(page, page.getByText('Retention & engagement').first());
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
    async setup(page) {
      await page.goto(`${WEB}/en/member/classes`, { waitUntil: 'networkidle' });
    },
    async play(page) {
      await page.mouse.move(640, 300);
      await page.waitForTimeout(700);
      await page.getByText('Loading classes').waitFor({ state: 'hidden', timeout: 15000 });
      await tap(page, page.getByText('List', { exact: true }).first());
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      // A class card's accessible name starts with its start time (`16:00…`).
      await tap(page, page.getByRole('button', { name: /^\d{2}:\d{2}/ }).first());
      await page.waitForTimeout(1200);
      const book = page.getByRole('button', { name: /^Book/ }).last();
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

async function record(browser, name, theme, states) {
  const scene = SCENES[name];
  const size = scene.frame === 'phone' ? PHONE : DESKTOP;
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
    colorScheme: theme,
    isMobile: scene.frame === 'phone',
    hasTouch: false,
    storageState: scene.member ? states.memberState : states.staffState,
  });
  for (const url of [ADMIN, WEB]) {
    await context.addCookies([
      { name: 'theme', value: theme, url },
      { name: 'NEXT_LOCALE', value: 'en', url },
    ]);
  }
  await context.addInitScript(cursorScript(scene.frame));
  const page = await context.newPage();
  await scene.setup(page);
  await page.waitForTimeout(1200);

  const dir = mkdtempSync(join(tmpdir(), `tour-${name}-${theme}-`));
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
  await scene.play(page);
  await cdp.send('Page.stopScreencast');
  await context.close();
  encode(name, theme, frames, dir);
  rmSync(dir, { recursive: true, force: true });
}

function encode(name, theme, frames, dir) {
  if (frames.length < 2) throw new Error(`${name}-${theme}: no frames captured`);
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

  const base = join(OUT, `${name}-${theme}`);
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
    'libvpx-vp9',
    '-crf',
    '36',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    '-an',
    `${base}.webm`,
  ]);
  run(['-ss', '0.3', '-i', `${base}.mp4`, '-frames:v', '1', '-q:v', '3', `${base}.jpg`]);
  console.log(`${name}-${theme}: ${frames.length} frames`);
}

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(SCENES);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const states = await signIn(browser);
for (const name of names) {
  for (const theme of ['light', 'dark']) await record(browser, name, theme, states);
}
await browser.close();
