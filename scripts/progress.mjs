#!/usr/bin/env node
// Counts the checkboxes under "## Workstreams" in docs/PROGRESS.md and keeps the summary table current.
// Workstream headings carry a tier tag: "### [T1] Name". T1 ships for the hackathon, T2 reinforces it, T3 is roadmap.
//   node scripts/progress.mjs           print the table
//   node scripts/progress.mjs --write   rewrite the table between the progress markers
//   node scripts/progress.mjs --check   exit 1 if the table in the file is out of date (used by CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../docs/PROGRESS.md', import.meta.url));
const text = readFileSync(file, 'utf8');

const START = '<!-- progress:start -->';
const END = '<!-- progress:end -->';

const body = text.split('\n## Workstreams')[1]?.split(/\n## (?!#)/)[0] ?? '';
const rows = [];
let current;
for (const line of body.split('\n')) {
  const heading = /^### (?:\[T([123])\]\s*)?(.+)$/.exec(line);
  if (heading) {
    current = { tier: Number(heading[1] ?? 1), name: heading[2].trim(), done: 0, total: 0 };
    rows.push(current);
    continue;
  }
  const box = /^- \[( |x)\] /.exec(line);
  if (box && current) {
    current.total += 1;
    if (box[1] === 'x') current.done += 1;
  }
}

const pct = (d, t) => (t === 0 ? 0 : Math.round((d / t) * 100));
const sum = (list) => list.reduce((acc, r) => ({ done: acc.done + r.done, total: acc.total + r.total }), { done: 0, total: 0 });
const t1 = sum(rows.filter((r) => r.tier === 1));
const all = sum(rows);

const table = [
  '| Workstream | Tier | Done | Total | Complete |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.name} | T${r.tier} | ${r.done} | ${r.total} | ${pct(r.done, r.total)}% |`),
  `| **Tier 1 (ships for the hackathon)** | T1 | **${t1.done}** | **${t1.total}** | **${pct(t1.done, t1.total)}%** |`,
  `| **All tiers** | all | **${all.done}** | **${all.total}** | **${pct(all.done, all.total)}%** |`,
].join('\n');

const block = `${START}\n${table}\n${END}`;
const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);

if (!pattern.test(text)) {
  console.error(`Missing ${START} / ${END} markers in docs/PROGRESS.md`);
  process.exit(2);
}

const next = text.replace(pattern, block);
const arg = process.argv[2];

if (arg === '--write') {
  writeFileSync(file, next);
  console.log(table);
} else if (arg === '--check') {
  if (next !== text) {
    console.error('docs/PROGRESS.md summary table is out of date. Run: npm run progress:write');
    process.exit(1);
  }
  console.log(`progress table is current (tier 1: ${t1.done}/${t1.total}, all: ${all.done}/${all.total})`);
} else {
  console.log(table);
}
