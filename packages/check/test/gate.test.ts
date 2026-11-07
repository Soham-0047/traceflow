import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sampleGraph } from '@traceflow/core';
import type { OrgGraph } from '@traceflow/core';
import { checkPullRequest } from '../src/gate.js';
import { main } from '../src/cli.js';

describe('checkPullRequest (the gate)', () => {
  it('passes a change that traces to work and live decisions', () => {
    const result = checkPullRequest(sampleGraph, 'pr-31'); // linked from PAY-15 -> decision d3 (proposed)
    expect(result.verdict).toBe('pass');
    expect(result.reasons.some((r) => r.level === 'info' && /PAY-15/.test(r.message))).toBe(true);
    expect(result.reasons.some((r) => r.level === 'info' && /idempotency key scope/.test(r.message))).toBe(true);
    expect(result.reasons.every((r) => r.evidence.length > 0)).toBe(true);
  });

  it('fails a change with no linked work item: no provenance', () => {
    const graph: OrgGraph = {
      ...sampleGraph,
      pullRequests: [
        ...sampleGraph.pullRequests,
        { ref: { source: 'bitbucket', id: 'pr-40', title: 'Mystery refactor' }, authorId: 'sam', state: 'open', reviewerIds: [] },
      ],
    };
    const result = checkPullRequest(graph, 'pr-40');
    expect(result.verdict).toBe('fail');
    expect(result.reasons[0]?.message).toMatch(/no recorded provenance/i);
    expect(result.reasons[0]?.evidence[0]?.id).toBe('pr-40');
  });

  it('fails a change whose work implements a superseded decision', () => {
    const graph: OrgGraph = {
      ...sampleGraph,
      pullRequests: [
        ...sampleGraph.pullRequests,
        { ref: { source: 'bitbucket', id: 'pr-41', title: 'Signing key rotation' }, authorId: 'sam', state: 'open', reviewerIds: [] },
      ],
      workItems: sampleGraph.workItems.map((w) =>
        w.ref.id === 'AUTH-4' ? { ...w, linkedPullRequestIds: ['pr-41'] } : w,
      ),
    };
    // AUTH-4 is covered by d2, which is superseded.
    const result = checkPullRequest(graph, 'pr-41');
    expect(result.verdict).toBe('fail');
    const error = result.reasons.find((r) => r.level === 'error');
    expect(error?.message).toMatch(/superseded/);
    expect(error?.evidence.map((e) => e.id)).toEqual(['AUTH-4', 'd2']);
  });

  it('does not fail on a proposed decision: work may start before approval', () => {
    const result = checkPullRequest(sampleGraph, 'pr-33'); // PAY-18, no decisions
    expect(result.verdict).toBe('pass');
    expect(result.reasons.some((r) => /not linked to any recorded decision/.test(r.message))).toBe(true);
  });

  it('matches ids case-insensitively and fails helpfully for unknown ids', () => {
    expect(checkPullRequest(sampleGraph, 'PR-31').verdict).toBe('pass');
    expect(() => checkPullRequest(sampleGraph, 'pr-999')).toThrow(/Known pull requests:/);
  });
});

describe('traceflow-check CLI', () => {
  function graphFile(graph: OrgGraph): string {
    const dir = mkdtempSync(join(tmpdir(), 'traceflow-check-'));
    const path = join(dir, 'graph.json');
    writeFileSync(path, JSON.stringify(graph));
    return path;
  }

  function textFile(text: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'traceflow-check-'));
    const path = join(dir, 'graph.json');
    writeFileSync(path, text);
    return path;
  }

  it('exits 0 with human output for a passing change', () => {
    const outcome = main(['--graph', graphFile(sampleGraph), '--pr', 'pr-31']);
    expect(outcome.code).toBe(0);
    expect(outcome.text).toContain('pass');
    expect(outcome.text).toContain('evidence: jira:PAY-15');
  });

  it('exits 1 for a failing change and reports the reason', () => {
    const graph: OrgGraph = {
      ...sampleGraph,
      pullRequests: [
        ...sampleGraph.pullRequests,
        { ref: { source: 'bitbucket', id: 'pr-42', title: 'Untethered change' }, authorId: 'sam', state: 'open', reviewerIds: [] },
      ],
    };
    const outcome = main(['--graph', graphFile(graph), '--pr', 'pr-42', '--json']);
    expect(outcome.code).toBe(1);
    const parsed = JSON.parse(outcome.text);
    expect(parsed.verdict).toBe('fail');
    expect(parsed.reasons[0].level).toBe('error');
  });

  it('exits 2 for usage and data errors', () => {
    expect(main([]).code).toBe(2);
    expect(main(['--graph', 'x.json']).code).toBe(2);
    expect(main(['--graph', '/nonexistent.json', '--pr', 'pr-1']).code).toBe(2);
    expect(main(['--graph', graphFile(sampleGraph), '--pr', 'nope']).code).toBe(2);
    expect(main(['--nonsense']).code).toBe(2);
  });

  it('exits 2 with per-record issue paths for a corrupt export (the gate never runs on silently-broken data)', () => {
    const corrupt = {
      ...sampleGraph,
      workItems: [...sampleGraph.workItems, { ref: { source: 'jira', id: 'BAD-1', title: 'Broken' }, status: 'wednesday' }],
    };
    const outcome = main(['--graph', graphFile(corrupt as unknown as OrgGraph), '--pr', 'pr-31']);
    expect(outcome.code).toBe(2);
    expect(outcome.text).toContain('is not valid');
    expect(outcome.text).toContain('$.workItems[11].status');
  });

  it('exits 2 for a non-object export', () => {
    const outcome = main(['--graph', textFile('[1,2,3]'), '--pr', 'pr-31']);
    expect(outcome.code).toBe(2);
    expect(outcome.text).toContain('is not valid');
  });

  it('prints usage with --help', () => {
    const outcome = main(['--help']);
    expect(outcome.code).toBe(0);
    expect(outcome.text).toContain('usage: traceflow-check');
  });
});
