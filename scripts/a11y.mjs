#!/usr/bin/env node
// Accessibility audit for TraceFlow (the automated part of the a11y pass).
//
// Serves site/ (landing page) and demo/dist (the Workbench demo) exactly like
// the published Pages layout (page at /, demo at /demo/), loads each view in
// headless Chromium at desktop and phone widths, and runs axe-core with the
// WCAG 2.0/2.1 A+AA and best-practice rule sets. Any violation fails the run.
//
// Prerequisite: `npm run build` (the script refuses to audit a missing
// demo/dist). Chromium comes from Playwright; on GitHub-hosted runners, where
// no Playwright browser is downloaded, it falls back to the preinstalled
// system Google Chrome.
//
// Usage: npm run a11y

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const axeSource = require.resolve('axe-core/axe.min.js');

const siteDir = join(root, 'site');
const demoDist = join(root, 'demo', 'dist');
if (!existsSync(demoDist)) {
  console.error('demo/dist is missing. Run `npm run build` first.');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// One server, two roots: /demo/* serves the built demo, everything else the
// landing site. Same shape as the published GitHub Pages artifact.
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let base = siteDir;
    let rel = path;
    if (path === '/demo' || path.startsWith('/demo/')) {
      base = demoDist;
      rel = path.slice('/demo'.length) || '/';
    }
    let file = normalize(join(base, rel));
    if (!file.startsWith(base)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (rel.endsWith('/')) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;

// What gets audited: the landing page, every Workbench view, and the three
// forced demo states, at the two widths the visual review used.
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const audits = [
  { label: 'landing', url: '/', viewport: DESKTOP },
  { label: 'landing', url: '/', viewport: PHONE },
  { label: 'demo overview', url: '/demo/#/overview', viewport: DESKTOP },
  { label: 'demo overview', url: '/demo/#/overview', viewport: PHONE },
  { label: 'demo people', url: '/demo/#/people', viewport: DESKTOP },
  { label: 'demo people', url: '/demo/#/people', viewport: PHONE },
  { label: 'demo impact', url: '/demo/#/impact', viewport: DESKTOP },
  { label: 'demo impact', url: '/demo/#/impact', viewport: PHONE },
  { label: 'demo epics', url: '/demo/#/epics', viewport: DESKTOP },
  { label: 'demo epics', url: '/demo/#/epics', viewport: PHONE },
  { label: 'demo decisions', url: '/demo/#/decisions', viewport: DESKTOP },
  { label: 'demo decisions', url: '/demo/#/decisions', viewport: PHONE },
  { label: 'demo loading state', url: '/demo/?demo=loading', viewport: DESKTOP },
  { label: 'demo empty state', url: '/demo/?demo=empty', viewport: DESKTOP },
  { label: 'demo error state', url: '/demo/?demo=error', viewport: DESKTOP },
];

const AXE_OPTIONS = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
};

async function launch() {
  try {
    return await chromium.launch();
  } catch (error) {
    console.log(`Playwright Chromium unavailable (${error.message.split('\n')[0]}); trying system Chrome.`);
    return chromium.launch({ channel: 'chrome' });
  }
}

const browser = await launch();
let violations = 0;

try {
  for (const { label, url, viewport } of audits) {
    const page = await browser.newPage({ viewport });
    await page.goto(origin + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500); // let the demo adapter's 300ms settle and fonts swap in
    await page.addScriptTag({ path: axeSource });
    const results = await page.evaluate((options) => window.axe.run(document, options), AXE_OPTIONS);
    const where = `${label} @ ${viewport.width}px (${url})`;
    if (results.violations.length === 0) {
      console.log(`  ok    ${where}`);
    } else {
      for (const v of results.violations) {
        violations += v.nodes.length;
        console.log(`  FAIL  ${where}`);
        console.log(`        ${v.id} [${v.impact ?? '?'}] ${v.help} (${v.nodes.length} node(s))`);
        for (const node of v.nodes.slice(0, 3)) {
          console.log(`          - ${node.target.join(' ')}`);
        }
        if (v.nodes.length > 3) console.log(`          - … ${v.nodes.length - 3} more`);
        console.log(`          fix: ${v.helpUrl}`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

const checks = audits.length;
if (violations > 0) {
  console.error(`\na11y: ${violations} violation node(s) across ${checks} audit(s). Fix them and re-run.`);
  process.exit(1);
}
console.log(`\na11y: clean. 0 violations across ${checks} audits (axe-core, WCAG 2.x AA + best practices).`);
