/**
 * Impact-view layout check: assert the geometry of the new
 * impact surfaces in a real browser — tab strip renders above the rail and
 * switches subjects, the rail sits left of the main panel on desktop, panels
 * stack on phone width, and nothing overflows the viewport horizontally.
 *
 *   node scripts/session10-layout.mjs
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const demoRoot = resolve(root, 'demo/dist');
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const rel = path.startsWith('/demo/') ? path.slice('/demo'.length) : path;
    const file = resolve(demoRoot, rel === '/' || rel === '' ? 'index.html' : rel.replace(/^\/+/, ''));
    const body = await readFile(file);
    res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function box(selector) {
  return page.locator(selector).first().boundingBox();
}

// ---- epic impact, desktop ----
await page.goto(`${origin}/demo/#/impact/epic/PAY-1`);
await page.waitForSelector('h1:has-text("what a change affects")');
console.log('epic impact @1280:');
const tabs = await box('nav.impact-tabs');
const rail = await box('section.rail');
const main = await box('section.main');
check(tabs !== null, 'tab strip renders');
check(rail !== null && main !== null && rail.x < main.x, 'rail is left of main');
check(tabs.y < rail.y + 40, 'tab strip sits at the top of the rail column');
check((await page.locator('nav.impact-tabs a[aria-current="page"]').textContent()) === 'Epics', 'Epics tab is current');
const tabCount = await page.locator('nav.impact-tabs a').count();
check(tabCount === 3, `three subject tabs (got ${tabCount})`);
for (const section of ['Work that loses its plan', 'Records to re-check', 'Unreviewed changes', 'Already recorded gaps', 'Who needs to know']) {
  check((await page.locator('h2', { hasText: section }).count()) === 1, `section "${section}"`);
}
const docWide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check(docWide, 'no horizontal overflow at 1280px');

// ---- decision impact, desktop ----
await page.goto(`${origin}/demo/#/impact/decision/d3`);
await page.waitForSelector('h1:has-text("idempotency key scope")');
console.log('decision impact @1280:');
check((await page.locator('nav.impact-tabs a[aria-current="page"]').textContent()) === 'Decisions', 'Decisions tab is current');
for (const section of ['Work to review against the new decision', 'Changes that may carry the wrong intent', 'Who needs to know']) {
  check((await page.locator('h2', { hasText: section }).count()) === 1, `section "${section}"`);
}
check(
  (await page.locator('button', { hasText: 'Add idempotency keys may no longer match the intent' }).count()) >= 1,
  'outdated work row lists PAY-15 ("Add idempotency keys...")',
);

// ---- person impact unchanged, desktop ----
await page.goto(`${origin}/demo/#/impact/alex`);
await page.waitForSelector('h1:has-text("Alex Rivera")');
console.log('person impact @1280:');
check((await page.locator('nav.impact-tabs a[aria-current="page"]').textContent()) === 'People', 'People tab is current');
check((await page.locator('h2', { hasText: 'Stalled epics' }).count()) === 1, 'person sections unchanged');
check((await page.locator('h2', { hasText: 'Who needs to know' }).count()) === 0, 'person panel has no who-needs-to-know section');

// ---- tab switching works in the real browser ----
await page.click('nav.impact-tabs a:has-text("Epics")');
await page.waitForSelector('h1:has-text("Payments reliability")');
console.log('tab switch in-browser:');
check(true, 'clicking the Epics tab lands on the epic panel');
check(page.url().includes('/impact/epic/'), `URL is the epic route (${page.url().replace(origin, '')})`);

// ---- phone width: single column, no overflow ----
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${origin}/demo/#/impact/decision/d1`);
await page.waitForSelector('h1:has-text("queue vs cron")');
await page.waitForTimeout(300);
console.log('decision impact @390:');
const railPhone = await box('section.rail');
const mainPhone = await box('section.main');
check(railPhone !== null && mainPhone !== null && Math.abs(railPhone.x - mainPhone.x) < 2, 'rail and main stack (single column)');
const phoneWide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check(phoneWide, 'no horizontal overflow at 390px');

await browser.close();
server.close();
if (failures.length > 0) {
  console.log(`\nFAILED: ${failures.length} layout check(s)`);
  process.exit(1);
}
console.log('\nPASSED: all layout checks green');
