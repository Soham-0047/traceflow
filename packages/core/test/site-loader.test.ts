import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JQL,
  SiteRequestError,
  loadSiteGraph,
  pageIdFromRemoteLink,
  parseRetryAfter,
  withRetry,
  pageIdFromUrl,
  runPipeline,
  workItemType,
} from '../src/index.js';
import type { SiteRequester } from '../src/index.js';

/*
 * Payload shapes follow Atlassian's published REST documentation for the
 * endpoints the loader calls (Jira enhanced search, remote links, user bulk;
 * Confluence v2 pages and versions). Spike S1 replaces them with recorded
 * payloads from the dev site.
 */

type Handler = (path: string, url: URL) => unknown;

/** A requester routed by path prefix; records every call. */
function fakeSite(routes: { jira?: [string, Handler][]; confluence?: [string, Handler][] }) {
  const calls: { source: 'jira' | 'confluence'; path: string }[] = [];
  const route = (source: 'jira' | 'confluence', table: [string, Handler][] = []) => async (path: string) => {
    calls.push({ source, path });
    const url = new URL(path, 'https://site.example');
    const hit = table.find(([prefix]) => path.startsWith(prefix));
    if (!hit) throw new SiteRequestError(404, path);
    return hit[1](path, url);
  };
  const requester: SiteRequester = { jira: route('jira', routes.jira), confluence: route('confluence', routes.confluence) };
  return { requester, calls };
}

const epic = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  fields: {
    summary: `Epic ${key}`,
    status: { statusCategory: { key: 'indeterminate' } },
    assignee: { accountId: 'acc-alex', displayName: 'Alex Rivera', accountType: 'atlassian' },
    issuetype: { name: 'Epic', hierarchyLevel: 1 },
    ...over,
  },
});

const story = (key: string, parent?: string, over: Record<string, unknown> = {}) => ({
  key,
  fields: {
    summary: `Story ${key}`,
    status: { statusCategory: { key: 'indeterminate' } },
    assignee: { accountId: 'acc-priya', displayName: 'Priya Nair', accountType: 'atlassian' },
    issuetype: { name: 'Story', hierarchyLevel: 0 },
    ...(parent ? { parent: { key: parent, fields: { summary: `Epic ${parent}`, issuetype: { name: 'Epic', hierarchyLevel: 1 } } } } : {}),
    ...over,
  },
});

const page = (id: string, title: string, authorId: string, version: { number: number; authorId: string }) => ({
  id,
  title,
  status: 'current',
  authorId,
  version,
  _links: { webui: `/spaces/ENG/pages/${id}/${encodeURIComponent(title)}` },
});

const emptyPages = (): [string, Handler] => ['/wiki/api/v2/pages?', () => ({ results: [], _links: {} })];

describe('page ids from links', () => {
  it('reads every URL shape Confluence Cloud produces', () => {
    expect(pageIdFromUrl('https://s.atlassian.net/wiki/spaces/ENG/pages/123/Title')).toBe('123');
    expect(pageIdFromUrl('https://s.atlassian.net/wiki/spaces/ENG/pages/123')).toBe('123');
    expect(pageIdFromUrl('https://s.atlassian.net/wiki/spaces/ENG/pages/edit-v2/456')).toBe('456');
    expect(pageIdFromUrl('https://s.atlassian.net/wiki/pages/viewpage.action?pageId=789')).toBe('789');
    expect(pageIdFromUrl('https://s.atlassian.net/wiki/pages/viewpage.action?spaceKey=ENG&pageId=790#x')).toBe('790');
    expect(pageIdFromUrl('appId=4ff5e2a9-0000-0000-0000-000000000000&pageId=321')).toBe('321');
    expect(pageIdFromUrl('https://s.atlassian.net/wiki/x/AbCd')).toBeUndefined();
    expect(pageIdFromUrl('https://s.atlassian.net/wiki/spaces/ENG/pages/12ab/Title')).toBeUndefined();
  });

  it('ignores links to another site and falls back to the globalId', () => {
    const site = 'https://s.atlassian.net';
    expect(pageIdFromRemoteLink({ object: { url: 'https://other.atlassian.net/wiki/spaces/X/pages/5/A' } }, site)).toBeUndefined();
    expect(pageIdFromRemoteLink({ object: { url: 'https://S.atlassian.net/wiki/spaces/X/pages/5/A' } }, site)).toBe('5');
    expect(pageIdFromRemoteLink({ globalId: 'appId=x&pageId=77', object: { url: 'https://s.atlassian.net/wiki/x/Ab' } }, site)).toBe('77');
  });

  it('types issues by hierarchy level first, so localized names still work', () => {
    expect(workItemType({ name: 'Épica', hierarchyLevel: 1 })).toBe('epic');
    expect(workItemType({ name: 'Unteraufgabe', hierarchyLevel: -1 })).toBe('task');
    expect(workItemType({ name: 'Story' })).toBe('story');
    expect(workItemType({ name: 'Aufgabe', hierarchyLevel: 0 })).toBe('other');
  });
});

describe('loadSiteGraph: Jira enhanced search', () => {
  it('pages with nextPageToken, sends fields and a bounded JQL, and never sends a token first', async () => {
    const { requester, calls } = fakeSite({
      jira: [
        [
          '/rest/api/3/search/jql',
          (_p, url) =>
            url.searchParams.get('nextPageToken') === 't2'
              ? { issues: [story('PAY-2', 'PAY-1')], isLast: true }
              : { issues: [epic('PAY-1')], nextPageToken: 't2', isLast: false },
        ],
        ['/rest/api/3/issue/', () => []],
      ],
      confluence: [emptyPages()],
    });
    const { graph, report } = await loadSiteGraph(requester);
    const searches = calls.filter((c) => c.path.startsWith('/rest/api/3/search/jql'));
    expect(searches).toHaveLength(2);
    const first = new URL(searches[0]!.path, 'https://x');
    expect(first.searchParams.get('jql')).toBe(DEFAULT_JQL);
    expect(first.searchParams.get('fields')).toBe('summary,status,assignee,issuetype,parent');
    expect(first.searchParams.has('nextPageToken')).toBe(false);
    expect(graph.workItems.map((w) => w.ref.id).sort()).toEqual(['PAY-1', 'PAY-2']);
    expect(graph.workItems.find((w) => w.ref.id === 'PAY-2')?.epicId).toBe('PAY-1');
    expect(report.issues).toBe(2);
    expect(calls.some((c) => c.path.startsWith('/rest/api/3/search?') || c.path === '/rest/api/3/search')).toBe(false);
  });

  it('stops on a repeated token instead of looping forever', async () => {
    let n = 0;
    const { requester } = fakeSite({
      jira: [
        ['/rest/api/3/search/jql', () => ({ issues: [epic(`E-${++n}`)], nextPageToken: 'same', isLast: false })],
        ['/rest/api/3/issue/', () => []],
      ],
      confluence: [emptyPages()],
    });
    const { graph, report } = await loadSiteGraph(requester);
    expect(graph.workItems).toHaveLength(2);
    expect(report.warnings.join(' ')).toMatch(/already returned/);
  });

  it('stops when a page brings no new issues (the same-page bug)', async () => {
    const { requester, calls } = fakeSite({
      jira: [
        ['/rest/api/3/search/jql', (_p, url) => ({ issues: [epic('E-1')], nextPageToken: `t${url.searchParams.get('nextPageToken') ?? '0'}x` })],
        ['/rest/api/3/issue/', () => []],
      ],
      confluence: [emptyPages()],
    });
    await loadSiteGraph(requester);
    expect(calls.filter((c) => c.path.startsWith('/rest/api/3/search/jql'))).toHaveLength(2);
  });

  it('reports truncation at the issue cap', async () => {
    const { requester } = fakeSite({
      jira: [
        ['/rest/api/3/search/jql', () => ({ issues: [epic('E-1'), epic('E-2'), epic('E-3')], nextPageToken: 'more' })],
        ['/rest/api/3/issue/', () => []],
      ],
      confluence: [emptyPages()],
    });
    const { graph, report } = await loadSiteGraph(requester, { limits: { maxIssues: 2 } });
    expect(graph.workItems).toHaveLength(2);
    expect(report.truncated).toContain('issues: stopped at 2');
  });

  it('fails loudly when search itself fails (no silently empty graph)', async () => {
    const { requester } = fakeSite({ jira: [['/rest/api/3/search/jql', () => { throw new SiteRequestError(410, 'x'); }]] });
    await expect(loadSiteGraph(requester)).rejects.toThrow(SiteRequestError);
  });

  it('fetches an epic outside the JQL window with a bounded key query, but never a non-epic parent', async () => {
    const { requester, calls } = fakeSite({
      jira: [
        [
          '/rest/api/3/search/jql',
          (_p, url) =>
            url.searchParams.get('jql')!.startsWith('key in')
              ? { issues: [epic('OLD-1')] }
              : {
                  issues: [
                    story('NEW-2', 'OLD-1'),
                    { ...story('NEW-3'), fields: { ...story('NEW-3').fields, parent: { key: 'NEW-9', fields: { issuetype: { name: 'Story', hierarchyLevel: 0 } } } } },
                  ],
                },
        ],
        ['/rest/api/3/issue/', () => []],
      ],
      confluence: [emptyPages()],
    });
    const { graph } = await loadSiteGraph(requester);
    const keyQuery = calls.find((c) => c.path.includes('key+in') || decodeURIComponent(c.path).includes('key in'));
    expect(new URL(keyQuery!.path, 'https://x').searchParams.get('jql')).toBe('key in (OLD-1)');
    expect(graph.workItems.find((w) => w.ref.id === 'NEW-2')?.epicId).toBe('OLD-1');
    expect(graph.workItems.some((w) => w.ref.id === 'NEW-9')).toBe(false);
  });
});

describe('loadSiteGraph: remote links and pages', () => {
  function site(extra: { versions?: Record<string, string[]>; pages?: unknown[]; failVersions?: boolean } = {}) {
    return fakeSite({
      jira: [
        ['/rest/api/3/search/jql', () => ({ issues: [epic('PAY-1'), story('PAY-2', 'PAY-1'), story('PAY-3', 'PAY-1')] })],
        [
          '/rest/api/3/issue/PAY-1/remotelink',
          () => [
            { globalId: 'appId=abc&pageId=100', application: { type: 'com.atlassian.confluence' }, object: { url: 'https://s.atlassian.net/wiki/pages/viewpage.action?pageId=100', title: 'Spec' } },
            { object: { url: 'https://other.atlassian.net/wiki/spaces/X/pages/200/Elsewhere' } },
          ],
        ],
        ['/rest/api/3/issue/PAY-2/remotelink', () => [{ object: { url: 'https://s.atlassian.net/wiki/spaces/ENG/pages/300/Decision' } }]],
        ['/rest/api/3/issue/PAY-3/remotelink', () => { throw new SiteRequestError(403, 'x'); }],
        [
          '/rest/api/3/user/bulk',
          (_p, url) => ({
            values: url.searchParams.getAll('accountId').map((id) =>
              id === 'acc-bot' ? { accountId: id, displayName: 'Automation for Jira', accountType: 'app' } : { accountId: id, displayName: `Name of ${id}`, accountType: 'atlassian' },
            ),
          }),
        ],
      ],
      confluence: [
        [
          '/wiki/api/v2/pages/',
          (path) => {
            if (extra.failVersions) throw new SiteRequestError(500, path);
            const id = /\/pages\/(\d+)\/versions/.exec(path)![1]!;
            return { results: (extra.versions?.[id] ?? []).map((authorId, i) => ({ number: i + 1, authorId })) };
          },
        ],
        [
          '/wiki/api/v2/pages?',
          (_p, url) =>
            url.searchParams.has('cursor')
              ? { results: [page('400', 'Runbook', 'acc-sam', { number: 1, authorId: 'acc-sam' })], _links: { base: 'https://s.atlassian.net/wiki' } }
              : {
                  results: extra.pages ?? [
                    page('100', 'Payments spec', 'acc-alex', { number: 4, authorId: 'acc-alex' }),
                    page('300', 'Decision: queue vs cron', 'acc-priya', { number: 3, authorId: 'acc-bot' }),
                  ],
                  _links: { next: '/wiki/api/v2/pages?cursor=abc&limit=250', base: 'https://s.atlassian.net/wiki' },
                },
        ],
      ],
    });
  }

  it('links work to pages through every link shape, derives the site url, and degrades per issue', async () => {
    const { requester } = site({ versions: { '100': ['acc-alex', 'acc-alex', 'acc-sam', 'acc-alex'], '300': ['acc-priya', 'acc-bot', 'acc-bot'] } });
    const { graph, report } = await loadSiteGraph(requester);
    const byId = Object.fromEntries(graph.workItems.map((w) => [w.ref.id, w]));
    expect(byId['PAY-1']?.linkedPageIds).toEqual(['100']); // viewpage.action; the other-site link is ignored
    expect(byId['PAY-2']?.linkedPageIds).toEqual(['300']);
    expect(byId['PAY-1']?.ref.url).toBe('https://s.atlassian.net/browse/PAY-1');
    expect(graph.pages.find((p) => p.ref.id === '100')?.ref.url).toBe('https://s.atlassian.net/wiki/spaces/ENG/pages/100/Payments%20spec');
    expect(report.warnings.join(' ')).toMatch(/remote links: 1 issue/);
    expect(graph.pages.map((p) => p.ref.id).sort()).toEqual(['100', '300', '400']); // cursor followed
  });

  it('reads history where the page record cannot settle contributors, and names everyone', async () => {
    const { requester } = site({ versions: { '100': ['acc-alex', 'acc-sam', 'acc-alex'], '300': ['acc-priya', 'acc-bot', 'acc-bot'] } });
    const { graph } = await loadSiteGraph(requester);
    const pages = Object.fromEntries(graph.pages.map((p) => [p.ref.id, p.contributorIds]));
    expect(pages['100']).toEqual(['acc-alex', 'acc-sam']); // ambiguous page: history revealed a second editor
    expect(pages['400']).toEqual(['acc-sam']); // one version: exact without a call
    expect(pages['300']).toEqual(['acc-priya']); // the app account is not a person
    expect(graph.people.find((p) => p.id === 'acc-sam')?.name).toBe('Name of acc-sam');
    expect(graph.people.some((p) => p.id === 'acc-bot')).toBe(false);
    // The decision page becomes a decision record linked to the work that points at it.
    expect(graph.decisions).toEqual([
      expect.objectContaining({ ref: expect.objectContaining({ id: '300' }), ownerId: 'acc-priya', status: 'proposed', linkedWorkItemIds: ['PAY-2'] }),
    ]);
  });

  it('leaves out an ambiguous page whose history cannot be read instead of calling it sole-contributor', async () => {
    const { requester } = site({ failVersions: true });
    const { graph, report } = await loadSiteGraph(requester);
    expect(graph.pages.some((p) => p.ref.id === '100')).toBe(false);
    expect(report.warnings.join(' ')).toMatch(/1 page\(s\) left out because their edit history/);
    // Page 300 was edited by Priya and an app: with the app removed one person remains and the
    // middle version is unknown, so it is left out too rather than becoming a sole-contributor page.
    expect(graph.pages.some((p) => p.ref.id === '300')).toBe(false);
    expect(report.warnings.join(' ')).toMatch(/with app accounts removed one person remains/);
    expect(graph.pages.map((p) => p.ref.id)).toEqual(['400']);
  });

  it('treats a history longer than one read as incomplete', async () => {
    const { requester } = site({
      pages: [page('100', 'Payments spec', 'acc-alex', { number: 80, authorId: 'acc-alex' })],
      versions: { '100': Array.from({ length: 50 }, () => 'acc-alex') },
    });
    const { graph } = await loadSiteGraph(requester);
    expect(graph.pages.some((p) => p.ref.id === '100')).toBe(false);
  });

  it('spends the history budget on linked and decision pages first', async () => {
    const { requester, calls } = site({
      pages: [
        page('900', 'Unlinked notes', 'acc-sam', { number: 5, authorId: 'acc-sam' }),
        page('100', 'Payments spec', 'acc-alex', { number: 4, authorId: 'acc-alex' }),
      ],
      versions: { '100': ['acc-alex'], '900': ['acc-sam'] },
    });
    const { graph } = await loadSiteGraph(requester, { limits: { maxVersionCalls: 1 } });
    const versionCalls = calls.filter((c) => c.path.includes('/versions'));
    expect(versionCalls.map((c) => /pages\/(\d+)/.exec(c.path)![1])).toEqual(['100']);
    expect(graph.pages.some((p) => p.ref.id === '900')).toBe(false);
    expect(graph.pages.find((p) => p.ref.id === '100')?.contributorIds).toEqual(['acc-alex']);
  });

  it('builds a graph without Confluence when pages cannot be read', async () => {
    const { requester } = fakeSite({
      jira: [
        ['/rest/api/3/search/jql', () => ({ issues: [epic('PAY-1')] })],
        ['/rest/api/3/issue/', () => []],
      ],
    });
    const { graph, report } = await loadSiteGraph(requester, { siteUrl: 'https://s.atlassian.net' });
    expect(graph.pages).toEqual([]);
    expect(graph.workItems).toHaveLength(1);
    expect(report.warnings[0]).toMatch(/Confluence pages could not be read \(status 404\)/);
  });

  it('produces a graph the strict pipeline accepts, and reports every raw response', async () => {
    const seen: string[] = [];
    const { requester, calls } = site({ versions: { '100': ['acc-alex', 'acc-sam'], '300': ['acc-priya'] } });
    const { graph } = await loadSiteGraph(requester, { onResponse: (_s, path) => seen.push(path) });
    expect(() => runPipeline(graph, { mode: 'strict' })).not.toThrow();
    expect(seen.length).toBe(calls.length - 1); // the one failed call returns no body
  });

  it('encodes path segments and skips keys that are not issue keys', async () => {
    const { requester, calls } = fakeSite({
      jira: [
        ['/rest/api/3/search/jql', () => ({ issues: [epic('PAY-1'), { key: '../admin', fields: { summary: 'x' } }] })],
        ['/rest/api/3/issue/', () => []],
      ],
      confluence: [emptyPages()],
    });
    await loadSiteGraph(requester);
    const linkCalls = calls.filter((c) => c.path.endsWith('/remotelink')).map((c) => c.path);
    expect(linkCalls).toEqual(['/rest/api/3/issue/PAY-1/remotelink']);
  });
});

describe('withRetry', () => {
  it('retries 429 and 503 with Retry-After, and passes every other failure through', async () => {
    const waits: number[] = [];
    let n = 0;
    const flaky: SiteRequester = {
      jira: async (path) => {
        n++;
        if (n === 1) throw new SiteRequestError(429, path, undefined, 2);
        if (n === 2) throw new SiteRequestError(503, path);
        return { ok: true };
      },
      confluence: async (path) => {
        throw new SiteRequestError(403, path);
      },
    };
    const requester = withRetry(flaky, { sleep: async (ms) => void waits.push(ms) });
    await expect(requester.jira('/rest/x')).resolves.toEqual({ ok: true });
    expect(waits).toEqual([2000, 1000]);
    await expect(requester.confluence('/wiki/x')).rejects.toMatchObject({ status: 403 });
    expect(waits).toHaveLength(2);
  });

  it('gives up after its retries, and never waits longer than the cap', async () => {
    const always = (status: number, after?: number): SiteRequester => ({
      jira: async (path) => {
        throw new SiteRequestError(status, path, undefined, after);
      },
      confluence: async (path) => {
        throw new SiteRequestError(status, path);
      },
    });
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    await expect(withRetry(always(429), { sleep }).jira('/x')).rejects.toMatchObject({ status: 429 });
    expect(waits).toEqual([500, 1000]);
    await expect(withRetry(always(429, 60), { sleep }).jira('/x')).rejects.toMatchObject({ status: 429 });
    expect(waits).toHaveLength(2);
    expect(parseRetryAfter('3')).toBe(3);
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
