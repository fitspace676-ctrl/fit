// Does the palette actually re-colour the console, persist, and survive navigation?
import { chromium, request } from '@playwright/test';
const OUT =
  '/private/tmp/claude-501/-Users-beqolozi-Developer-fit/921b5fc1-bdb6-44a5-8491-bb904c73e0c8/scratchpad';
const api = await request.newContext({ baseURL: 'http://localhost:3000' });
const r = await api.post('/auth/login', {
  data: { email: 'alex@example.com', password: 'Test1234!', gymSlug: 'downtown' },
});
const { accessToken } = await r.json();
await api.dispose();

const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
await ctx.addCookies([
  {
    name: 'accessToken',
    value: accessToken,
    domain: 'downtown.localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  },
  {
    name: 'NEXT_LOCALE',
    value: 'en',
    domain: 'downtown.localhost',
    path: '/',
    secure: false,
    sameSite: 'Lax',
  },
]);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 160)));

const accentOf = () =>
  p.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
  );

await p.goto('http://downtown.localhost:3001/admin/members', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
console.log('default accent      :', await accentOf());

// The dock must be reachable and centred at the bottom.
const pill = p.getByRole('button', { name: /Colours/ });
console.log('switcher present    :', (await pill.count()) > 0);
const box = await pill.first().boundingBox();
const vw = 1440;
console.log(
  'centred at bottom   :',
  box ? `x≈${Math.round(box.x + box.width / 2)} of ${vw}, y=${Math.round(box.y)}` : 'no box',
);

await pill.first().click();
await p.waitForTimeout(700);
// A real click on a preset — the same thing a person does.
// Confirm the swatch opens showing the console's real colour, not a guess.
console.log('swatch shows        :', await p.locator('input[type="color"]').first().inputValue());
await p.getByRole('button', { name: /Emerald/ }).click();
await p.waitForTimeout(900);
console.log('after Emerald preset :', await accentOf());
console.log(
  'derived tint        :',
  await p.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-accent-muted').trim(),
  ),
);
console.log(
  'stored              :',
  await p.evaluate(() => localStorage.getItem('fit-admin-palette')),
);
// The primary button used to ignore the theme entirely — check it now follows.
const btnBg = await p
  .getByRole('button', { name: /Add member/ })
  .first()
  .evaluate((el) => getComputedStyle(el).backgroundImage)
  .catch(() => 'n/a');
console.log('primary button now  :', btnBg.slice(0, 80));
await p.screenshot({ path: `${OUT}/palette-members.png` });

// Navigate to two other screens — the colour must follow, with no flash back.
for (const path of ['/admin/shop']) {
  await p.goto(`http://downtown.localhost:3001${path}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  console.log(`${path.padEnd(34)}:`, await accentOf());
}
await p.screenshot({ path: `${OUT}/palette-templates.png` });

// Reset must put it back.
await p.goto('http://downtown.localhost:3001/admin/members', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p
  .getByRole('button', { name: /Colours/ })
  .first()
  .click();
await p.waitForTimeout(600);
await p.getByRole('button', { name: /Reset to theme/ }).click();
await p.waitForTimeout(900);
console.log(
  'after reset         :',
  await accentOf(),
  '| stored:',
  await p.evaluate(() => localStorage.getItem('fit-admin-palette')),
);
await b.close();
