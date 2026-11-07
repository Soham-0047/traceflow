import { describe, expect, it } from 'vitest';
import {
  analyzeAll,
  answerQuery,
  graphFingerprint,
  runPipeline,
  runPipelineOnJson,
  ValidationError,
} from '../src/index.js';
import { sampleGraph } from '../src/fixtures.js';
import type { OrgGraph, Person, PullRequest, WorkItem, Page, Decision } from '../src/index.js';

/** Deterministic shuffle (mulberry32) so the determinism tests never flake. */
function seededShuffle<T>(items: T[], seed: number): T[] {
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
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Deep copy with every collection shuffled: same records, hostile order. */
function shuffledGraph(graph: OrgGraph, seed = 42): OrgGraph {
  return {
    people: seededShuffle(graph.people, seed),
    workItems: seededShuffle(graph.workItems, seed + 1),
    pages: seededShuffle(graph.pages, seed + 2),
    pullRequests: seededShuffle(graph.pullRequests, seed + 3),
    decisions: seededShuffle(graph.decisions, seed + 4),
  };
}

describe('runPipeline', () => {
  it('strict mode returns the typed graph with index and fingerprint', () => {
    const result = runPipeline(sampleGraph);
    expect(result.graph).toBe(sampleGraph);
    expect(result.warnings).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(result.index.peopleById.size).toBe(3);
    expect(result.index.epics.map((e) => e.ref.id)).toEqual(['PAY-1', 'AUTH-1', 'ONB-1']);
  });

  it('strict mode throws a ValidationError with issue paths on corrupt input', () => {
    expect(() => runPipeline({ people: [{}] })).toThrow(ValidationError);
    try {
      runPipeline({ people: [{}] });
      expect.unreachable();
    } catch (err) {
      expect((err as ValidationError).message).toContain('$.people[0]');
    }
  });

  it('best-effort mode quarantines broken records and keeps the rest', () => {
    const corrupt = {
      ...shuffledGraph(sampleGraph),
      workItems: [
        ...sampleGraph.workItems,
        { ref: { source: 'jira', id: 'BAD-2', title: 'No status' } },
      ],
    };
    const result = runPipeline(corrupt, { mode: 'best-effort' });
    expect(result.rejected.some((r) => r.path === '$.workItems[11]')).toBe(true);
    expect(result.graph.workItems).toHaveLength(sampleGraph.workItems.length);
    // The sanitized graph passes strict validation afterwards.
    expect(() => runPipeline(result.graph)).not.toThrow();
  });

  it('runPipelineOnJson parses exports and fails with every issue when corrupt', () => {
    const ok = runPipelineOnJson(JSON.stringify(sampleGraph));
    expect(ok.graph.people).toHaveLength(3);
    expect(() => runPipelineOnJson('{"people": 5}')).toThrow(ValidationError);
  });
});

describe('determinism (the same records in any order produce the same output)', () => {
  it('the fingerprint is order-insensitive and change-sensitive', () => {
    const shuffled = shuffledGraph(sampleGraph, 7);
    expect(graphFingerprint(shuffled)).toBe(graphFingerprint(sampleGraph));

    const changed: OrgGraph = {
      ...sampleGraph,
      pages: sampleGraph.pages.map((p) => (p.ref.id === 'p1' ? { ...p, contributorIds: ['alex', 'sam'] } : p)),
    };
    expect(graphFingerprint(changed)).not.toBe(graphFingerprint(sampleGraph));

    // Presentation-only urls do not change the data fingerprint.
    const withUrls: OrgGraph = {
      ...sampleGraph,
      workItems: sampleGraph.workItems.map((w) => ({
        ...w,
        ref: { ...w.ref, url: 'https://example.atlassian.net/browse/' + w.ref.id },
      })),
    };
    expect(graphFingerprint(withUrls)).toBe(graphFingerprint(sampleGraph));
  });

  it('analyzeAll is byte-identical across runs and input orderings', () => {
    const first = JSON.stringify(analyzeAll(sampleGraph));
    const again = JSON.stringify(analyzeAll(sampleGraph));
    const shuffled = JSON.stringify(analyzeAll(shuffledGraph(sampleGraph, 99)));
    expect(again).toBe(first);
    expect(shuffled).toBe(first);
  });

  it('deterministic answers are byte-identical across runs and input orderings', () => {
    const questions = [
      'What are the biggest knowledge risks right now?',
      'What is the risk around Alex Rivera?',
      'What breaks if Alex leaves?',
      'Trace the epic PAY-1',
      'What is the status of the idempotency decision?',
      'Give me an overview of the organization',
    ];
    for (const q of questions) {
      const a = JSON.stringify(answerQuery(sampleGraph, q));
      const b = JSON.stringify(answerQuery(shuffledGraph(sampleGraph, 5), q));
      expect(b).toBe(a);
    }
  });
});

describe('analyzeAll', () => {
  const analysis = analyzeAll(sampleGraph);

  it('covers every person, epic and decision with known sample facts', () => {
    expect(analysis.rankedPeople[0]?.personName).toBe('Alex Rivera');
    expect(analysis.rankedPeople[0]?.score).toBe(63);
    expect(analysis.impacts).toHaveLength(3);
    expect(analysis.lineages.map((l) => l.epic.id)).toEqual(['AUTH-1', 'ONB-1', 'PAY-1']);
    expect(analysis.decisionReports.map((d) => d.decision.id)).toEqual(['d1', 'd2', 'd3']);
    expect(analysis.overview.counts.pendingDecisions).toBe(2);
  });

  it('carries the same fingerprint as the graph', () => {
    expect(analysis.fingerprint).toBe(graphFingerprint(sampleGraph));
  });
});

describe('performance smoke (guarded, CI-safe budgets)', () => {
  /** Synthetic but realistic org: 250 people, 3,000 items, 3,000 pages, 600 PRs, 300 decisions. */
  function syntheticGraph(): OrgGraph {
    const people: Person[] = Array.from({ length: 250 }, (_, i) => ({ id: `acc-${i}`, name: `Person ${i}` }));
    const workItems: WorkItem[] = [];
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
    const pages: Page[] = Array.from({ length: 3000 }, (_, i) => ({
      ref: { source: 'confluence', id: `pg-${i}`, title: i % 7 === 0 ? `Decision: page ${i}` : `Page ${i}` },
      contributorIds: i % 3 === 0 ? [`acc-${i % 250}`] : [`acc-${i % 250}`, `acc-${(i + 1) % 250}`],
    }));
    const pullRequests: PullRequest[] = Array.from({ length: 600 }, (_, i) => ({
      ref: { source: 'bitbucket', id: `pr-${i}`, title: `PR ${i}` },
      authorId: `acc-${i % 250}`,
      state: i % 3 === 0 ? 'merged' : 'open',
      reviewerIds: [`acc-${(i + 7) % 250}`],
    }));
    const decisions: Decision[] = pages
      .filter((p) => p.ref.title.startsWith('Decision:'))
      .slice(0, 300)
      .map((p, i) => {
        const statuses: Decision['status'][] = ['proposed', 'approved', 'superseded'];
        return {
          ref: p.ref,
          ownerId: `acc-${i % 250}`,
          status: statuses[i % 3]!,
          pendingApproverIds: i % 2 === 0 ? [`acc-${(i + 3) % 250}`] : [],
          linkedWorkItemIds: [`W-${i * 2}`],
        };
      });
    return { people, workItems, pages, pullRequests, decisions };
  }

  it('analyzes a 7k-record org well inside the budget, warm faster than cold', () => {
    const graph = syntheticGraph();
    expect(graph.workItems.length).toBe(250 * 12); // 3,000 items (250 epics + 2,750 children)

    const coldStart = performance.now();
    const cold = analyzeAll(graph);
    const coldMs = performance.now() - coldStart;

    const warmStart = performance.now();
    analyzeAll(graph);
    const warmMs = performance.now() - warmStart;

    expect(cold.rankedPeople).toHaveLength(250);
    expect(cold.lineages).toHaveLength(250);
    // Generous CI-safe ceilings (sandbox runs finish far below these).
    expect(coldMs).toBeLessThan(5_000);
    expect(warmMs).toBeLessThan(coldMs + 1);
  });
});
