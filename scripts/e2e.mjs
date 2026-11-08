#!/usr/bin/env node
/**
 * TraceFlow end-to-end harness: every pipeline, checked end to end.
 *
 * Stages (in order; any failure fails the run):
 *  1. validate        the sample fixtures pass the strict pipeline
 *  2. corrupt export  best-effort quarantine + strict refusal with issue paths
 *  3. determinism     shuffled input -> identical fingerprint, analysis, answers
 *  4. engine          known facts from the sample story (scores, impacts, gaps)
 *  5. answers         the deterministic answer layer: eight intents + honest misses
 *  6. grounding       the guard accepts faithful paraphrases, rejects inventions
 *  7. MCP in-process  a real SDK client over InMemoryTransport, 9 tools
 *  8. MCP over stdio  the built CLI as a subprocess, JSON-RPC handshake + calls
 *  9. check gate      the bundled CLI as a subprocess: exit codes 0 / 1 / 2
 * 10. performance     a synthetic 7k-record org inside CI-safe budgets
 *
 * Run after `npm run build` (the harness loads the built dists, not the
 * TypeScript sources): `npm run e2e`.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  analyzeAll,
  answerQuery,
  checkGrounding,
  decisionImpact,
  epicImpact,
  groundedAnswer,
  groundingFacts,
  graphFingerprint,
  personImpact,
  runPipeline,
  runPipelineOnJson,
  sampleGraph,
  ValidationError,
} from '@traceflow/core';
import { createTraceflowServer } from '@traceflow/mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = join(root, '.tmp', 'e2e');
const mcpCli = join(root, 'packages', 'mcp', 'dist', 'cli.js');
const checkCli = join(root, 'packages', 'check', 'dist', 'cli.js');

const results = [];
let failed = false;

function stage(name, fn) {
  return async () => {
    const start = performance.now();
    try {
      const note = await fn();
      const ms = Math.round(performance.now() - start);
      results.push({ name, ok: true, ms, note: note ?? '' });
      console.log(`  ok    ${name}${note ? ` — ${note}` : ''} (${ms}ms)`);
    } catch (err) {
      failed = true;
      const ms = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name, ok: false, ms, note: message });
      console.log(`  FAIL  ${name} (${ms}ms)\n        ${message.split('\n').join('\n        ')}`);
    }
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Deterministic shuffle (mulberry32) — the determinism checks never flake. */
function shuffle(items, seed) {
  let a = seed;
  const rand = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Run a node script as a subprocess; resolve { code, stdout, stderr }. */
function runNode(script, args, { env = {}, timeoutMs = 30000 } = {}) {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rej(new Error(`${script} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => { clearTimeout(timer); rej(err); });
    child.on('close', (code) => { clearTimeout(timer); res({ code: code ?? -1, stdout, stderr }); });
  });
}

/**
 * A minimal MCP stdio client: newline-delimited JSON-RPC over the child's
 * stdin/stdout. Enough for initialize -> tools/list -> tools/call.
 */
function mcpStdioCall(script, env, requests, timeoutMs = 30000) {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [script], { cwd: root, env: { ...process.env, ...env } });
    let buffer = '';
    const answers = new Map();
    let nextId = 1;
    const pending = new Map(); // id -> resolve
    let stderr = '';

    const fail = (err) => { child.kill('SIGKILL'); rej(err); };
    const timer = setTimeout(() => fail(new Error('stdio MCP client timed out')), timeoutMs);

    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id !== undefined && pending.has(message.id)) {
          pending.get(message.id)(message);
          pending.delete(message.id);
        }
      }
    });
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', fail);

    const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');
    const request = (method, params) =>
      new Promise((res2) => {
        const id = nextId++;
        pending.set(id, res2);
        send({ jsonrpc: '2.0', id, method, params });
      });

    (async () => {
      const init = await request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'traceflow-e2e', version: '0.0.0' },
      });
      if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      for (const [method, params] of requests) {
        const answer = await request(method, params);
        if (answer.error) throw new Error(`${method} failed: ${JSON.stringify(answer.error)}`);
        answers.set(method + ':' + (params?.name ?? ''), answer.result);
      }
      clearTimeout(timer);
      child.stdin.end();
      child.kill('SIGKILL');
      res({ init, answers, stderr });
    })().catch(fail);
  });
}

/* ------------------------------------------------------------------ */

const stages = [];

stages.push(stage('1. validate: fixtures pass the strict pipeline', async () => {
  const result = runPipeline(sampleGraph, { mode: 'strict', context: 'e2e fixtures' });
  assert(result.warnings.length === 0, `expected no warnings, got ${result.warnings.length}`);
  assert(result.rejected.length === 0, 'expected no rejected records');
  assert(/^[0-9a-f]{16}$/.test(result.fingerprint), `bad fingerprint: ${result.fingerprint}`);
  assert(result.index.epics.length === 3, 'expected 3 epics in the index');
  return `fingerprint ${result.fingerprint}`;
}));

stages.push(stage('2. corrupt export: quarantine (best-effort) and refuse (strict)', async () => {
  const corrupt = {
    ...sampleGraph,
    workItems: [
      ...sampleGraph.workItems,
      { ref: { source: 'jira', id: 'BAD-1', title: 'Broken' }, status: 'wednesday' },
      { ref: { source: 'jira', id: 'PAY-99', title: 'Dangling' }, assigneeId: 'ghost', epicId: 'NOPE-1', status: 'open', linkedPageIds: ['p1', 'missing-page'] },
    ],
  };
  const bestEffort = runPipeline(corrupt, { mode: 'best-effort' });
  assert(bestEffort.rejected.some((r) => r.path === '$.workItems[11]'), 'BAD-1 should be quarantined');
  assert(bestEffort.graph.workItems.some((w) => w.ref.id === 'PAY-99'), 'PAY-99 should survive');
  const pay99 = bestEffort.graph.workItems.find((w) => w.ref.id === 'PAY-99');
  assert(pay99.assigneeId === undefined && pay99.epicId === undefined, 'dangling refs should be dropped');
  assert(bestEffort.warnings.length >= 3, 'dangling refs should be warned');
  // The sanitized graph now passes strict validation.
  runPipeline(bestEffort.graph, { mode: 'strict' });

  let threw = false;
  try { runPipeline(corrupt, { mode: 'strict' }); } catch (err) { threw = err instanceof ValidationError; }
  assert(threw, 'strict mode must refuse the corrupt graph');
  try {
    runPipelineOnJson('{not json', { context: 'e2e corrupt' });
    throw new Error('unreachable');
  } catch (err) {
    assert(err instanceof ValidationError, 'bad JSON must throw ValidationError');
  }
  return `${bestEffort.rejected.length} record(s) quarantined, ${bestEffort.warnings.length} warning(s)`;
}));

stages.push(stage('3. determinism: shuffled input, identical output', async () => {
  const shuffled = {
    people: shuffle(sampleGraph.people, 11),
    workItems: shuffle(sampleGraph.workItems, 12),
    pages: shuffle(sampleGraph.pages, 13),
    pullRequests: shuffle(sampleGraph.pullRequests, 14),
    decisions: shuffle(sampleGraph.decisions, 15),
  };
  assert(graphFingerprint(shuffled) === graphFingerprint(sampleGraph), 'fingerprint must be order-insensitive');
  const a = JSON.stringify(analyzeAll(sampleGraph));
  const b = JSON.stringify(analyzeAll(shuffled));
  assert(a === b, 'analyzeAll must be byte-identical across input orderings');
  for (const q of [
    'What are the biggest knowledge risks right now?',
    'What breaks if Alex leaves?',
    'Trace the epic PAY-1',
  ]) {
    assert(
      JSON.stringify(answerQuery(shuffled, q)) === JSON.stringify(answerQuery(sampleGraph, q)),
      `answer must be identical for: ${q}`,
    );
  }
  return `${a.length} bytes of analysis, byte-identical`;
}));

stages.push(stage('4. engine: the sample story reports its known facts', async () => {
  const analysis = analyzeAll(sampleGraph);
  assert(analysis.rankedPeople[0].personName === 'Alex Rivera', 'Alex must rank first');
  assert(analysis.rankedPeople[0].score === 63, `Alex score must be 63, got ${analysis.rankedPeople[0].score}`);
  assert(analysis.rankedPeople[0].level === 'high', 'Alex must be high risk');
  const alex = personImpact(sampleGraph, 'alex');
  assert(alex.counts.stalledEpics === 1 && alex.counts.orphanedPages === 7, `unexpected alex impact: ${JSON.stringify(alex.counts)}`);
  assert(analysis.overview.counts.soleContributorPages === 8, 'expected 8 sole-contributor pages');
  assert(analysis.overview.counts.pendingDecisions === 2, 'expected 2 pending decisions');
  const pay1 = analysis.lineages.find((l) => l.epic.id === 'PAY-1');
  assert(pay1.gaps.length === 2, `PAY-1 must have 2 gaps, got ${pay1.gaps.length}`);
  const d1 = analysis.decisionReports.find((d) => d.decision.id === 'd1');
  assert(d1.findings.some((f) => f.kind === 'unapproved-decision'), 'd1 must flag work done against a proposal');
  // Epic and decision impact ride in analyzeAll, canonically ordered.
  assert(analysis.epicImpacts.length === 3, `expected 3 epic impact reports, got ${analysis.epicImpacts.length}`);
  const pay1Impact = analysis.epicImpacts.find((r) => r.epic.id === 'PAY-1');
  assert(
    pay1Impact.counts.orphanedWork === 4 && pay1Impact.counts.staleSpecs === 5 && pay1Impact.counts.unreviewedChanges === 2,
    `unexpected PAY-1 impact: ${JSON.stringify(pay1Impact.counts)}`,
  );
  assert(
    pay1Impact.people.map((p) => p.person.id).join(',') === 'alex,sam',
    `PAY-1 impact people must be alex,sam: ${JSON.stringify(pay1Impact.people.map((p) => p.person.id))}`,
  );
  assert(analysis.decisionImpacts.length === 3, `expected 3 decision impact reports, got ${analysis.decisionImpacts.length}`);
  const d3Impact = decisionImpact(sampleGraph, 'd3');
  assert(
    d3Impact.counts.outdatedWork === 1 && d3Impact.counts.outdatedChanges === 1,
    `unexpected d3 impact: ${JSON.stringify(d3Impact.counts)}`,
  );
  assert(epicImpact(sampleGraph, 'AUTH-1').counts.staleSpecs === 2, 'AUTH-1 should link the superseded decision d2 as a stale spec');
  return `alex 63/high, ${analysis.lineages.length} lineages, ${analysis.decisionReports.length} decisions, ${analysis.epicImpacts.length} epic impacts`;
}));

stages.push(stage('5. answers: eight intents, evidence on every answer, honest misses', async () => {
  const cases = [
    ['What are the biggest knowledge risks right now?', 'top-risks'],
    ['What is the risk around Alex Rivera?', 'person-risk'],
    ['What breaks if Alex leaves?', 'person-impact'],
    ['Trace the epic PAY-1', 'epic-lineage'],
    ['What are the top knowledge-continuity risks in the Payments reliability epic?', 'epic-impact'],
    ['What is the status of the idempotency decision?', 'decision-trace'],
    ['What happens if the idempotency key scope decision changes?', 'decision-impact'],
    ['Give me an overview of the organization', 'overview'],
  ];
  for (const [question, intent] of cases) {
    const result = answerQuery(sampleGraph, question);
    assert(result.understood, `question not understood: ${question}`);
    assert(result.intent === intent, `wrong intent for "${question}": ${result.intent} (want ${intent})`);
    assert(result.evidence.length > 0, `no evidence for: ${question}`);
    assert(result.caveats.length > 0, `no caveats for: ${question}`);
  }
  const miss = answerQuery(sampleGraph, 'what is the weather on mars?');
  assert(!miss.understood && miss.suggestions.length > 0, 'a nonsense question must fail honestly with suggestions');
  const noEntity = answerQuery(sampleGraph, 'What breaks if the epic changes?');
  assert(!noEntity.understood && noEntity.suggestions.length === 8, 'an impact question naming no epic must fail honestly with 8 suggestions');
  return `${cases.length} intents verified, 2 honest misses`;
}));

stages.push(stage('6. grounding: faithful paraphrases pass, inventions fall back', async () => {
  const answer = answerQuery(sampleGraph, 'What is the risk around Alex Rivera?');
  const faithful =
    'Alex Rivera carries the highest knowledge-continuity risk in this data: 7 sole-contributor pages, 4 unresolved issues, 2 open pull requests and 2 decisions waiting on input, for a score of 63 (high).';
  assert(checkGrounding(faithful, groundingFacts(answer)).grounded, 'a faithful paraphrase must pass');
  for (const hallucination of [
    'Alex Rivera has a knowledge-risk score of 94.',
    'Alex Rivera is at risk, but Jordan Fields is the biggest risk on the team.',
    'Alex Rivera has open work including PAY-99.',
  ]) {
    const guarded = groundedAnswer(hallucination, answer);
    assert(!guarded.grounded && guarded.fallbackUsed, `invention must be rejected: ${hallucination}`);
    assert(guarded.text === answer.answer, 'fallback must be the deterministic answer');
  }
  // The same guard over the new epic-impact report shape.
  const epicAnswer = answerQuery(sampleGraph, 'What breaks if the Payments reliability epic changes?');
  const epicFaithful =
    'If Payments reliability (PAY-1) changes, 4 open issues lose their recorded plan, 5 linked pages or decisions are worth re-checking and 2 open pull requests may implement outdated intent. Alex Rivera and Sam Chen need to know.';
  assert(checkGrounding(epicFaithful, groundingFacts(epicAnswer)).grounded, 'a faithful epic-impact paraphrase must pass');
  for (const epicHallucination of [
    'If Payments reliability changes, 9 open issues lose their recorded plan.',
    'If Payments reliability changes, Priya Nair owns the epic and must be told first.',
  ]) {
    const guarded = groundedAnswer(epicHallucination, epicAnswer);
    assert(!guarded.grounded && guarded.fallbackUsed, `epic-impact invention must be rejected: ${epicHallucination}`);
    assert(guarded.text === epicAnswer.answer, 'epic-impact fallback must be the deterministic answer');
  }
  return '5 inventions rejected, fallbacks served';
}));

stages.push(stage('7. MCP in-process: nine tools over InMemoryTransport', async () => {
  const server = createTraceflowServer();
  const client = new Client({ name: 'e2e', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const listed = await client.listTools();
  assert(listed.tools.length === 9, `expected 9 tools, got ${listed.tools.length}`);
  const called = await client.callTool({
    name: 'traceflow_query',
    arguments: { question: 'What breaks if Alex Rivera leaves?' },
  });
  const payload = JSON.parse(called.content[0].text);
  assert(payload.intent === 'person-impact' && payload.understood, 'query tool must answer deterministically');
  const direct = answerQuery(sampleGraph, 'What breaks if Alex Rivera leaves?');
  assert(payload.answer === direct.answer, 'MCP answer must equal the engine answer');
  const epicImpactCall = await client.callTool({
    name: 'traceflow_epic_impact',
    arguments: { epic: 'PAY-1' },
  });
  const epicPayload = JSON.parse(epicImpactCall.content[0].text);
  assert(epicPayload.counts.orphanedWork === 4, `epic impact tool counts wrong: ${JSON.stringify(epicPayload.counts)}`);
  await client.close();
  await server.close();
  return `${listed.tools.map((t) => t.name.replace('traceflow_', '')).join(', ')}`;
}));

stages.push(stage('8. MCP over stdio: the built CLI answers a real JSON-RPC call', async () => {
  const exportPath = join(tmpDir, 'graph-export.json');
  const { answers, stderr } = await mcpStdioCall(mcpCli, { TRACEFLOW_GRAPH: exportPath }, [
    ['tools/list', {}],
    ['tools/call', { name: 'traceflow_query', arguments: { question: 'What is the risk around Alex Rivera?' } }],
    ['tools/call', { name: 'traceflow_decision_impact', arguments: { decision: 'idempotency key scope' } }],
  ]);
  const listed = answers.get('tools/list:');
  assert(listed && listed.tools && listed.tools.length === 9, `expected 9 tools over stdio, got ${listed?.tools?.length}`);
  const called = answers.get('tools/call:traceflow_query');
  const payload = JSON.parse(called.content[0].text);
  const direct = answerQuery(sampleGraph, 'What is the risk around Alex Rivera?');
  assert(payload.answer === direct.answer, 'stdio answer must equal the engine answer');
  const decisionImpactCall = answers.get('tools/call:traceflow_decision_impact');
  const decisionPayload = JSON.parse(decisionImpactCall.content[0].text);
  assert(decisionPayload.counts.outdatedWork === 1, `stdio decision impact wrong: ${JSON.stringify(decisionPayload.counts)}`);
  assert(/serving tools over stdio/.test(stderr), 'the CLI must announce itself on stderr');
  return `tools/list + 2 tools/call round-tripped over stdio`;
}));

stages.push(stage('9. check gate: exit codes 0 / 1 / 2 on a real export', async () => {
  const exportPath = join(tmpDir, 'graph-export.json');
  const pass = await runNode(checkCli, ['--graph', exportPath, '--pr', 'pr-31']);
  assert(pass.code === 0, `pr-31 (linked, proposed decision) must pass, got exit ${pass.code}\n${pass.stdout}${pass.stderr}`);
  assert(/pass/.test(pass.stdout), 'human output must state the verdict');
  const fail = await runNode(checkCli, ['--graph', exportPath, '--pr', 'pr-40']);
  assert(fail.code === 1, `pr-40 (no linked work) must fail with exit 1, got ${fail.code}`);
  const unknown = await runNode(checkCli, ['--graph', exportPath, '--pr', 'pr-999']);
  assert(unknown.code === 2, `unknown pr must exit 2, got ${unknown.code}`);
  const corruptPath = join(tmpDir, 'graph-corrupt.json');
  const corrupt = await runNode(checkCli, ['--graph', corruptPath, '--pr', 'pr-31']);
  assert(corrupt.code === 2, `corrupt export must exit 2, got ${corrupt.code}`);
  assert(corrupt.stdout.includes('$.workItems[11].status'), 'corrupt export must list the issue path');
  return '0 pass, 1 fail, 2 usage/data, all correct';
}));

stages.push(stage('10. performance: synthetic 7k-record org inside budget', async () => {
  const people = Array.from({ length: 250 }, (_, i) => ({ id: `acc-${i}`, name: `Person ${i}` }));
  const workItems = [];
  for (let e = 0; e < 250; e++) {
    workItems.push({ ref: { source: 'jira', id: `EP-${e}`, title: `Epic ${e}` }, type: 'epic', assigneeId: `acc-${e % 250}`, status: 'open' });
    for (let c = 0; c < 11; c++) {
      const i = e * 11 + c;
      workItems.push({
        ref: { source: 'jira', id: `W-${i}`, title: `Work ${i}` },
        type: c % 3 === 0 ? 'bug' : 'story',
        assigneeId: `acc-${i % 250}`,
        status: i % 4 === 0 ? 'done' : 'open',
        epicId: `EP-${e}`,
        linkedPageIds: [`pg-${i % 3000}`],
        linkedPullRequestIds: i % 5 === 0 ? [`pr-${i % 600}`] : undefined,
      });
    }
  }
  const pages = Array.from({ length: 3000 }, (_, i) => ({
    ref: { source: 'confluence', id: `pg-${i}`, title: i % 7 === 0 ? `Decision: page ${i}` : `Page ${i}` },
    contributorIds: i % 3 === 0 ? [`acc-${i % 250}`] : [`acc-${i % 250}`, `acc-${(i + 1) % 250}`],
  }));
  const pullRequests = Array.from({ length: 600 }, (_, i) => ({
    ref: { source: 'bitbucket', id: `pr-${i}`, title: `PR ${i}` },
    authorId: `acc-${i % 250}`,
    state: i % 3 === 0 ? 'merged' : 'open',
    reviewerIds: [`acc-${(i + 7) % 250}`],
  }));
  const decisions = pages
    .filter((p) => p.ref.title.startsWith('Decision:'))
    .slice(0, 300)
    .map((p, i) => ({
      ref: p.ref,
      ownerId: `acc-${i % 250}`,
      status: ['proposed', 'approved', 'superseded'][i % 3],
      pendingApproverIds: i % 2 === 0 ? [`acc-${(i + 3) % 250}`] : [],
      linkedWorkItemIds: [`W-${i * 2}`],
    }));
  const graph = { people, workItems, pages, pullRequests, decisions };
  assert(workItems.length === 3000, 'synthetic graph must have 3000 work items');

  const t0 = performance.now();
  const analysis = analyzeAll(graph);
  const cold = Math.round(performance.now() - t0);
  const t1 = performance.now();
  analyzeAll(graph);
  const warm = Math.round(performance.now() - t1);

  assert(analysis.rankedPeople.length === 250, 'all people analyzed');
  assert(analysis.lineages.length === 250, 'all epics traced');
  assert(cold < 5000, `cold analyzeAll too slow: ${cold}ms (budget 5000ms)`);
  assert(warm < cold, `warm run should reuse the index: warm ${warm}ms vs cold ${cold}ms`);
  return `cold ${cold}ms, warm ${warm}ms, 7,150 records`;
}));

/* ------------------------------------------------------------------ */

async function main() {
  // Prepare the exports the subprocess stages read.
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  const exportGraph = {
    ...sampleGraph,
    pullRequests: [
      ...sampleGraph.pullRequests,
      { ref: { source: 'bitbucket', id: 'pr-40', title: 'Mystery refactor' }, authorId: 'sam', state: 'open', reviewerIds: [] },
    ],
  };
  writeFileSync(join(tmpDir, 'graph-export.json'), JSON.stringify(exportGraph, null, 2));
  writeFileSync(
    join(tmpDir, 'graph-corrupt.json'),
    JSON.stringify({
      ...sampleGraph,
      workItems: [...sampleGraph.workItems, { ref: { source: 'jira', id: 'BAD-1', title: 'Broken' }, status: 'wednesday' }],
    }),
  );

  console.log('TraceFlow end-to-end harness\n');
  for (const run of stages) await run();

  console.log('');
  if (failed) {
    console.log(`FAILED: ${results.filter((r) => !r.ok).length} of ${results.length} stages failed`);
    process.exitCode = 1;
  } else {
    const total = results.reduce((sum, r) => sum + r.ms, 0);
    console.log(`PASSED: all ${results.length} stages green (${total}ms total)`);
  }
  // Keep the workspace clean; comment this out to inspect the exports.
  rmSync(tmpDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('e2e harness crashed:', err);
  process.exitCode = 1;
});
