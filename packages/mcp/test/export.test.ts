import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPipelineOnJson } from '@traceflow/core';
import { EXPORT_USAGE, rawFileName, runExport } from '../src/export.js';
import type { ExportIo } from '../src/export.js';
import { liveSiteSource, validatedSource } from '../src/server.js';

const ENV = {
  ATLASSIAN_SITE_URL: 'https://s.atlassian.net',
  ATLASSIAN_EMAIL: 'me@example.com',
  ATLASSIAN_API_TOKEN: 'secret-token',
};

/** A fake Atlassian Cloud site (documented payload shapes; spike S1 replaces them with recordings). */
function fakeSiteFetch(options: { searchStatus?: number } = {}) {
  const paths: string[] = [];
  const respond = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: async () => body,
  });
  const fake = (async (url: string) => {
    const path = url.replace('https://s.atlassian.net', '');
    paths.push(path);
    if (path.startsWith('/rest/api/3/search/jql')) {
      if (options.searchStatus) return respond(options.searchStatus, {});
      return respond(200, {
        issues: [
          {
            key: 'PAY-1',
            fields: {
              summary: 'Payments reliability',
              status: { statusCategory: { key: 'indeterminate' } },
              issuetype: { name: 'Epic', hierarchyLevel: 1 },
              assignee: { accountId: 'acc-alex', displayName: 'Alex Rivera' },
            },
          },
        ],
      });
    }
    if (path.startsWith('/rest/api/3/issue/PAY-1/remotelink')) {
      return respond(200, [{ object: { url: 'https://s.atlassian.net/wiki/spaces/ENG/pages/100/Spec' } }]);
    }
    if (path.startsWith('/wiki/api/v2/pages?')) {
      return respond(200, {
        results: [{ id: '100', title: 'Payments spec', authorId: 'acc-alex', version: { number: 1, authorId: 'acc-alex' }, _links: { webui: '/spaces/ENG/pages/100/Spec' } }],
        _links: { base: 'https://s.atlassian.net/wiki' },
      });
    }
    return respond(404, {});
  }) as unknown as typeof fetch;
  return { fake, paths };
}

function memoryIo(fetchImpl?: typeof fetch) {
  const out: string[] = [];
  const err: string[] = [];
  const files = new Map<string, string>();
  const dirs: string[] = [];
  const io: ExportIo = {
    stdout: (t) => void out.push(t),
    stderr: (t) => void err.push(t),
    writeFile: (p, t) => void files.set(p, t),
    mkdir: (p) => void dirs.push(p),
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  };
  return { io, out, err, files, dirs };
}

afterEach(() => vi.useRealTimers());

describe('traceflow-export', () => {
  it('prints usage, and refuses bad arguments and incomplete environments with exit 2', async () => {
    const help = memoryIo();
    expect(await runExport(['--help'], {}, help.io)).toBe(0);
    expect(help.out.join('')).toContain(EXPORT_USAGE.split('\n')[0]!);

    const none = memoryIo();
    expect(await runExport([], {}, none.io)).toBe(2);
    expect(none.err.join('')).toMatch(/ATLASSIAN_SITE_URL/);

    const partial = memoryIo();
    expect(await runExport([], { ATLASSIAN_SITE_URL: 'https://s.atlassian.net' }, partial.io)).toBe(2);
    expect(partial.err.join('')).toMatch(/missing: ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN/);

    const flag = memoryIo();
    expect(await runExport(['--nope'], ENV, flag.io)).toBe(2);
    expect(await runExport(['--max-issues', 'lots'], ENV, flag.io)).toBe(2);

    const http = memoryIo();
    expect(await runExport([], { ...ENV, ATLASSIAN_SITE_URL: 'http://s.atlassian.net' }, http.io)).toBe(2);
    expect(http.err.join('')).toMatch(/https/);
  });

  it('writes a strict-valid OrgGraph export and reports what it read', async () => {
    const { fake } = fakeSiteFetch();
    const run = memoryIo(fake);
    expect(await runExport([], ENV, run.io)).toBe(0);
    const { graph } = runPipelineOnJson(run.out.join(''));
    expect(graph.workItems.map((w) => w.ref.id)).toEqual(['PAY-1']);
    expect(graph.workItems[0]?.linkedPageIds).toEqual(['100']);
    expect(graph.pages[0]?.contributorIds).toEqual(['acc-alex']);
    expect(run.err.join('')).toMatch(/1 issues, 1 pages, 1 people/);
    expect([...run.out, ...run.err].join('')).not.toContain('secret-token');
  });

  it('writes the export to --out and every raw response to --raw (spike S1)', async () => {
    const { fake, paths } = fakeSiteFetch();
    const run = memoryIo(fake);
    expect(await runExport(['--out', 'graph.json', '--raw', 'raw', '--jql', 'project = PAY'], ENV, run.io)).toBe(0);
    expect(run.dirs).toEqual(['raw']);
    expect(JSON.parse(run.files.get('graph.json')!).workItems).toHaveLength(1);
    const raw = [...run.files.keys()].filter((k) => k.startsWith('raw/'));
    expect(raw.length).toBe(paths.filter((p) => !p.includes('/user/bulk')).length); // the failed lookup returns no body
    expect(raw[0]).toBe('raw/0001-jira-rest-api-3-search-jql.json');
    expect(JSON.parse(run.files.get(raw[0]!)!).path).toContain('jql=project+%3D+PAY');
  });

  it('exits 1 with an honest message when the site cannot be read', async () => {
    const { fake } = fakeSiteFetch({ searchStatus: 410 });
    const run = memoryIo(fake);
    expect(await runExport([], ENV, run.io)).toBe(1);
    expect(run.err.join('')).toMatch(/could not be read: Upstream request failed: 410/);
    expect(run.out).toEqual([]);
  });

  it('names raw files safely', () => {
    expect(rawFileName(7, 'confluence', '/wiki/api/v2/pages/123/versions?limit=50')).toBe('0007-confluence-wiki-api-v2-pages-123-versions.json');
  });
});

describe('the live-site MCP source', () => {
  it('reads the site once per TTL, re-validates new reads, and retries after a failure', async () => {
    vi.useFakeTimers();
    const { fake, paths } = fakeSiteFetch();
    const logs: string[] = [];
    const source = validatedSource(
      liveSiteSource({ siteUrl: ENV.ATLASSIAN_SITE_URL, email: 'e', apiToken: 't', fetch: fake, ttlSeconds: 60, log: (l) => logs.push(l) }),
      (l) => logs.push(l),
    );
    expect(source.name).toBe('site:s.atlassian.net');
    const first = await source.loadGraph();
    const second = await source.loadGraph();
    expect(second).toBe(first);
    const searchesAfterTwo = paths.filter((p) => p.startsWith('/rest/api/3/search/jql')).length;
    expect(searchesAfterTwo).toBe(1);
    vi.advanceTimersByTime(61_000);
    const third = await source.loadGraph();
    expect(third).not.toBe(first);
    expect(third.workItems).toEqual(first.workItems);
    expect(paths.filter((p) => p.startsWith('/rest/api/3/search/jql')).length).toBe(2);
    expect(logs.some((l) => l.includes('read 1 issues, 1 pages, 1 people'))).toBe(true);
  });
});
