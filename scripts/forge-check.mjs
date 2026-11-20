#!/usr/bin/env node
/**
 * The Forge app gate that runs without an Atlassian account (`npm run forge:check`,
 * in verify and CI). Session 18 found the manifest had never been valid for the
 * current Forge platform (a top-level `appId`, no `app.runtime`, a removed
 * `egress` key, an over-long action description, a Custom UI resource pointing
 * at a file); nothing caught it because nothing ran Atlassian's validator.
 *
 * Checks, in order:
 *  1. app/manifest.yml matches the tool catalog (scripts/forge-manifest.mjs --check).
 *  2. Atlassian's own validator (@forge/manifest, the library the Forge CLI
 *     uses) accepts it: schema, module rules, function key limits, handler
 *     files, resource directories.
 *  3. Cross-references the validator does not cover: every handler's module
 *     exports the named function; rovo:mcp tools and the agent's actions are
 *     declared actions; the Custom UI build is a directory with an index.html
 *     that loads nothing from outside Atlassian; no external permissions (Runs
 *     on Atlassian eligibility).
 *
 * Needs `npm run build` first (the engine for step 1, the Custom UI for step 2).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'app');
const require = createRequire(import.meta.url);
const failures = [];
const ok = (line) => console.log(`  ok    ${line}`);
const fail = (line) => {
  failures.push(line);
  console.log(`  FAIL  ${line}`);
};

console.log('TraceFlow Forge app check\n');

// 1. Generated manifest is current.
try {
  execFileSync(process.execPath, [join(root, 'scripts', 'forge-manifest.mjs'), '--check'], { stdio: 'pipe' });
  ok('manifest matches the tool catalog');
} catch (err) {
  fail(`manifest is stale: ${String(err.stderr || err.message).trim()}`);
}

// 2. Atlassian's validator, run from app/ so relative handler and resource paths resolve.
const { validate } = require('@forge/manifest');
const cwd = process.cwd();
process.chdir(appDir);
let result;
try {
  result = await validate(false, 'manifest.yml');
} finally {
  process.chdir(cwd);
}
const errors = (result.errors ?? []).filter((e) => e.level === 'error');
const warnings = (result.errors ?? []).filter((e) => e.level !== 'error');
if (result.success && errors.length === 0) ok("Atlassian's manifest validator (@forge/manifest) accepts app/manifest.yml");
for (const e of errors) fail(`validator: ${e.message}`);
for (const w of warnings) console.log(`  warn  validator: ${w.message}`);

// 3. Cross-references.
const { parse } = require('yaml');
const manifest = parse(readFileSync(join(appDir, 'manifest.yml'), 'utf8'));
const modules = manifest.modules ?? {};

for (const fn of modules.function ?? []) {
  const [modulePath, exportName] = String(fn.handler).split('.');
  const file = ['ts', 'tsx', 'js'].map((ext) => join(appDir, 'src', `${modulePath}.${ext}`)).find(existsSync);
  if (!file) {
    fail(`function ${fn.key}: no source file for ${fn.handler}`);
    continue;
  }
  const source = readFileSync(file, 'utf8');
  const exported =
    new RegExp(`export\\s+(?:const|function|async\\s+function|let)\\s+${exportName}\\b`).test(source) ||
    new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`).test(source);
  if (exported) ok(`function ${fn.key} -> ${fn.handler} is exported`);
  else fail(`function ${fn.key}: ${modulePath} does not export ${exportName}`);
}

const actionKeys = new Set((modules.action ?? []).map((a) => a.key));
const functionKeys = new Set((modules.function ?? []).map((f) => f.key));
for (const a of modules.action ?? []) {
  if (!functionKeys.has(a.function)) fail(`action ${a.key}: unknown function ${a.function}`);
  if (a.actionVerb !== 'GET') fail(`action ${a.key}: TraceFlow actions are read-only (GET), found ${a.actionVerb}`);
}
for (const m of modules['rovo:mcp'] ?? []) {
  const unknown = (m.tools ?? []).filter((t) => !actionKeys.has(t));
  if (unknown.length) fail(`rovo:mcp ${m.key}: tools that are not actions: ${unknown.join(', ')}`);
  else ok(`rovo:mcp ${m.key} exposes ${m.tools.length} declared actions as tools`);
}
for (const agent of modules['rovo:agent'] ?? []) {
  const unknown = (agent.actions ?? []).filter((t) => !actionKeys.has(t));
  if (unknown.length) fail(`rovo:agent ${agent.key}: actions that are not declared: ${unknown.join(', ')}`);
  else ok(`rovo:agent ${agent.key} uses ${agent.actions.length} declared actions`);
}

for (const resource of manifest.resources ?? []) {
  const dir = join(appDir, resource.path);
  const index = join(dir, 'index.html');
  if (!existsSync(dir) || !statSync(dir).isDirectory() || !existsSync(index)) {
    fail(`resource ${resource.key}: ${resource.path} must be a built directory with index.html (run npm run build)`);
    continue;
  }
  const html = readFileSync(index, 'utf8');
  const external = [...html.matchAll(/(?:src|href)=["'](https?:)?\/\/[^"']+["']/g)].map((m) => m[0]);
  if (external.length) fail(`resource ${resource.key}: index.html loads external resources: ${external.join(' ')}`);
  else ok(`resource ${resource.key}: ${resource.path} is built and loads nothing from outside Atlassian`);
}

if (manifest.permissions?.external) fail('permissions.external is set: the app would leave Runs on Atlassian');
else ok('no external permissions (Runs on Atlassian eligible)');

if (String(manifest.app?.id ?? '').includes('REPLACE_AFTER_FORGE_REGISTER')) {
  console.log('\n  note  app.id is still the placeholder: run `forge register` in app/ (app/README.md)');
}

if (failures.length) {
  console.log(`\nFAILED: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log('\nPASSED: the Forge app is deployable as far as an offline check can tell');
