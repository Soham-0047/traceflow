import { describe, expect, it } from 'vitest';
import {
  buildOrgGraph,
  deriveDecisions,
  pageFromConfluence,
  pageIdFromUrl,
  workItemFromJira,
} from '../src/index.js';
import type { JiraIssueRaw } from '../src/index.js';

const issue = (over: Partial<JiraIssueRaw['fields']> & { key?: string } = {}): JiraIssueRaw => ({
  key: over.key ?? 'PAY-1',
  fields: {
    summary: 'Payments reliability',
    status: { statusCategory: { key: 'indeterminate' } },
    assignee: { accountId: 'acc-1', displayName: 'Alex' },
    issuetype: { name: 'Epic' },
    ...over,
  },
});

describe('pageIdFromUrl', () => {
  it('extracts the id from Confluence cloud URLs', () => {
    expect(pageIdFromUrl('https://x.atlassian.net/wiki/spaces/ENG/pages/123456/Retry+design')).toBe('123456');
    expect(pageIdFromUrl('https://example.com/nothing')).toBeUndefined();
  });
});

describe('workItemFromJira', () => {
  it('maps type, status category, assignee and links', () => {
    const w = workItemFromJira(issue(), {
      siteUrl: 'https://x.atlassian.net',
      remoteLinks: [
        { object: { url: 'https://x.atlassian.net/wiki/spaces/ENG/pages/111/A' } },
        { object: { url: 'https://x.atlassian.net/wiki/spaces/ENG/pages/111/A?x=1' } },
        { object: { url: 'https://other.example/doc' } },
      ],
    });
    expect(w.type).toBe('epic');
    expect(w.status).toBe('open');
    expect(w.assigneeId).toBe('acc-1');
    expect(w.linkedPageIds).toEqual(['111']);
    expect(w.ref.url).toBe('https://x.atlassian.net/browse/PAY-1');
  });

  it('treats the done status category as done and tolerates missing fields', () => {
    const w = workItemFromJira({ key: 'A-1', fields: { status: { statusCategory: { key: 'done' } }, assignee: null } });
    expect(w.status).toBe('done');
    expect(w.assigneeId).toBeUndefined();
    expect(w.ref.title).toBe('A-1');
    expect(w.type).toBe('other');
  });
});

describe('pageFromConfluence', () => {
  it('dedupes contributors and builds a /wiki URL', () => {
    const p = pageFromConfluence(
      { id: '111', title: 'Design', _links: { webui: '/spaces/ENG/pages/111/Design' } },
      ['a', 'a', 'b'],
      { siteUrl: 'https://x.atlassian.net' },
    );
    expect(p.contributorIds).toEqual(['a', 'b']);
    expect(p.ref.url).toBe('https://x.atlassian.net/wiki/spaces/ENG/pages/111/Design');
  });
});

describe('buildOrgGraph', () => {
  it('links epics to children and pages, and drops parents that are not epics', () => {
    const graph = buildOrgGraph({
      people: [{ id: 'acc-1', name: 'Alex' }],
      issues: [
        issue({ key: 'PAY-1' }),
        issue({ key: 'PAY-2', issuetype: { name: 'Story' }, parent: { key: 'PAY-1' } }),
        issue({ key: 'PAY-3', issuetype: { name: 'Sub-task' }, parent: { key: 'PAY-2' } }),
      ],
      remoteLinks: { 'PAY-1': [{ object: { url: 'https://x.atlassian.net/wiki/spaces/ENG/pages/111/A' } }] },
      pages: [{ raw: { id: '111', title: 'A' }, contributorIds: ['acc-1'] }],
    });
    const byId = Object.fromEntries(graph.workItems.map((w) => [w.ref.id, w]));
    expect(byId['PAY-2']?.epicId).toBe('PAY-1');
    expect(byId['PAY-3']?.epicId).toBeUndefined();
    expect(byId['PAY-1']?.linkedPageIds).toEqual(['111']);
    expect(graph.pullRequests).toEqual([]);
  });
});

describe('deriveDecisions', () => {
  const pages = [
    pageFromConfluence({ id: '9001', title: 'Decision: queue vs cron' }, ['acc-1', 'acc-2']),
    pageFromConfluence({ id: '9002', title: 'Decision: token format' }, ['acc-2']),
    pageFromConfluence({ id: '9003', title: 'Not a decision page' }, ['acc-1']),
    pageFromConfluence({ id: '9004', title: 'Decision: no contributors yet' }, []),
  ];
  const work = [
    workItemFromJira(issue({ key: 'PAY-12' }), {
      remoteLinks: [{ object: { url: 'https://x.atlassian.net/wiki/spaces/ENG/pages/9001/x' } }],
    }),
  ];

  it('treats "Decision: " pages as decision records with the first contributor as owner', () => {
    const decisions = deriveDecisions(pages, work);
    expect(decisions.map((d) => d.ref.id)).toEqual(['9001', '9002']);
    expect(decisions[0]).toMatchObject({
      ownerId: 'acc-1',
      status: 'proposed',
      pendingApproverIds: [],
      linkedWorkItemIds: ['PAY-12'],
    });
  });

  it('cannot detect approvals, so decisions stay proposed without pending approvers', () => {
    const decisions = deriveDecisions(pages, work);
    for (const d of decisions) {
      expect(d.status).toBe('proposed');
      expect(d.pendingApproverIds).toEqual([]);
    }
  });

  it('returns nothing for an empty page set', () => {
    expect(deriveDecisions([], work)).toEqual([]);
  });
});
