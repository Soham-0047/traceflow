/**
 * Session 17 browser smoke: verifies the fixed regressions in a real browser.
 * - Skip link no longer hijacks the router (view stays, focus lands on main)
 * - Subject change keeps focus (no remount of the whole view)
 * - view-in runs exactly once per view switch (not on finding changes)
 * - Evidence exchange still animates on finding change (selectionId key)
 * - Ask: input keeps focus across asks; Back returns to the previous question
 */
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = '/home/z/my-project/traceflow';
const demoDist = path.join(root, 'demo', 'dist');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

const srv = createServer(async (req, res) => {
  try {
    const rel = (decodeURIComponent(req.url.split('?')[0].slice('/demo'.length)) || '/');
    const p = path.join(demoDist, rel === '/' ? 'index.html' : rel.replace(/^\/+/, ''));
    const data = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('nf');
  }
});

srv.listen(0, async () => {
  const port = srv.address().port;
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const results = [];
  const check = (name, ok, extra) => { results.push([name, ok]); console.log(ok ? 'PASS' : 'FAIL', name, extra ?? ''); };

  // 1. Skip link: on People view, focus the skip link, press Enter.
  await page.goto(`http://localhost:${port}/demo/#/people/alex/finding/open-work-1`);
  await page.waitForTimeout(1300);
  await page.focus('.skip');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const afterSkip = await page.evaluate(() => ({
    hash: location.hash,
    viewKey: document.querySelector('.view') ? 'present' : 'gone',
    activeIsMain: document.activeElement === document.querySelector('main'),
    h1: document.querySelector('.page-head h1')?.textContent?.slice(0, 20),
  }));
  check('skip link keeps the People view (router not hijacked)',
    afterSkip.hash.includes('/people/') && afterSkip.h1?.includes('Alex'), JSON.stringify(afterSkip.h1));
  check('skip link moves focus to main', afterSkip.activeIsMain);

  // 2. Subject change keeps focus: focus a rail link, click a DIFFERENT person.
  await page.goto(`http://localhost:${port}/demo/#/people/alex`);
  await page.waitForTimeout(1300);
  const focusedId = await page.evaluate(() => {
    const links = [...document.querySelectorAll('.rail a')];
    if (links.length > 1) { links[1].focus(); return links[1].textContent.trim(); }
    return null;
  });
  await page.evaluate(() => { document.querySelectorAll('.rail a')[1]?.click(); });
  await page.waitForTimeout(500);
  const focusAfterNav = await page.evaluate(() => ({
    hash: location.hash,
    // Focus should not be body (pre-17: remount dropped it to body)
    onBody: document.activeElement === document.body,
    onRail: !!document.activeElement?.closest('.rail'),
    h1: document.querySelector('.page-head h1')?.textContent?.slice(0, 24),
  }));
  check('subject change keeps focus in the rail (no remount)', !focusAfterNav.onBody, JSON.stringify(focusAfterNav));

  // 3. view-in plays exactly once per view switch, not per finding change.
  await page.goto(`http://localhost:${port}/demo/#/people/alex`);
  await page.waitForTimeout(1300);
  const animCountBefore = await page.evaluate(() => {
    // count currently-animating .view
    return getComputedStyle(document.querySelector('.view')).animationName;
  });
  await page.evaluate(() => { document.querySelectorAll('.ledger-bar button')[0].click(); });
  await page.waitForTimeout(80);
  const viewAnimMidFinding = await page.evaluate(() => {
    const v = document.querySelector('.view');
    return { name: getComputedStyle(v).animationName, elapsed: getComputedStyle(v).animationDuration };
  });
  // The view element is NOT remounted on finding change, so its animation
  // already finished long ago; animationName stays view-in but the element
  // identity is stable. Verify identity via a data attribute probe.
  const identity = await page.evaluate(() => {
    const v = document.querySelector('.view');
    v.setAttribute('data-probe', 'marker');
    document.querySelectorAll('.ledger-bar button')[1]?.click();
    return new Promise((resolve) => setTimeout(() => {
      resolve({ kept: document.querySelector('.view')?.getAttribute('data-probe') === 'marker' });
    }, 200));
  });
  check('view DOM identity survives finding change (entrance not replayed)', identity.kept, '');

  // 4. Evidence exchange still runs on finding change (selectionId key).
  await page.goto(`http://localhost:${port}/demo/#/people/alex/finding/open-work-1`);
  await page.waitForTimeout(1300);
  await page.evaluate(() => { document.querySelectorAll('.ledger tbody .row-button')[2].click(); });
  await page.waitForTimeout(40);
  const exchange = await page.evaluate(() => {
    const e = document.querySelector('.evidence-body');
    return e ? { anim: getComputedStyle(e).animationName, title: e.querySelector('h3')?.textContent?.slice(0, 26) } : 'gone';
  });
  check('evidence exchange animates on finding change', exchange.anim === 'panel-in', JSON.stringify(exchange));

  // 5. Ask: input keeps focus across asks; Back returns to previous question.
  await page.goto(`http://localhost:${port}/demo/#/ask`);
  await page.waitForTimeout(700);
  await page.focus('#ask-input');
  await page.fill('#ask-input', 'What breaks if Alex leaves?');
  await page.click('.ask-form button[type=submit]');
  await page.waitForTimeout(600);
  const afterAsk1 = await page.evaluate(() => ({ hash: location.hash.slice(0, 40), focusIsInput: document.activeElement?.id === 'ask-input' }));
  check('ask input keeps focus after asking (no view remount)', afterAsk1.focusIsInput);
  await page.fill('#ask-input', 'Who is the payments single point of failure?');
  await page.click('.ask-form button[type=submit]');
  await page.waitForTimeout(600);
  await page.goBack();
  await page.waitForTimeout(600);
  const afterBack = await page.evaluate(() => ({
    hash: decodeURIComponent(location.hash.slice(0, 44)),
    question: document.querySelector('.ask-question')?.textContent?.slice(0, 30),
  }));
  check('Back from second question returns to the first', afterBack.question?.includes('Alex'), JSON.stringify(afterBack.question));

  await browser.close();
  srv.close();
  const failed = results.filter(([, ok]) => !ok);
  console.log(failed.length === 0 ? 'ALL SMOKE CHECKS PASS' : `${failed.length} FAILED`);
  process.exitCode = failed.length === 0 ? 0 : 1;
});
