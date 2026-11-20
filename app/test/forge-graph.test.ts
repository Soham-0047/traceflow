import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The Forge transport and the per-user cache, with @forge/api and @forge/kvs
 * mocked. What is pinned here is OUR contract (reads as the user, trusted
 * routes only for loader-encoded paths, per-account cache keys, honest status
 * errors); the real runtime behaviour is UNVERIFIED until spike S1.
 */

const calls: { product: string; path: string }[] = [];
const responses = new Map<string, { status: number; body?: unknown; headers?: Record<string, string> }>();
const store = new Map<string, unknown>();

vi.mock('@forge/api', () => {
  const respond = (product: string) => async (route: { value: string }) => {
    calls.push({ product, path: route.value });
    const hit = [...responses.entries()].find(([prefix]) => route.value.startsWith(prefix))?.[1] ?? { status: 404 };
    return {
      ok: hit.status >= 200 && hit.status < 300,
      status: hit.status,
      statusText: String(hit.status),
      headers: { get: (name: string) => hit.headers?.[name] ?? null },
      json: async () => hit.body,
    };
  };
  return {
    asUser: vi.fn(() => ({ requestJira: respond('jira'), requestConfluence: respond('confluence') })),
    assumeTrustedRoute: (value: string) => ({ value }),
  };
});

vi.mock('@forge/kvs', () => ({
  kvs: {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => void store.set(key, value),
  },
}));

import { asUser } from '@forge/api';
import { SiteRequestError } from '@traceflow/core';
import { forgeRequester, loadOrgGraphFromSite } from '../src/backend/graph';
import { graphCacheKey, loadSanitizedSiteGraph } from '../src/backend/site-graph';

beforeEach(() => {
  calls.length = 0;
  responses.clear();
  store.clear();
  responses.set('/rest/api/3/search/jql', {
    status: 200,
    body: {
      issues: [
        {
          key: 'PAY-1',
          fields: { summary: 'Payments', status: { statusCategory: { key: 'new' } }, issuetype: { name: 'Epic', hierarchyLevel: 1 }, assignee: { accountId: 'a1', displayName: 'Alex' } },
        },
      ],
    },
  });
  responses.set('/rest/api/3/issue/', { status: 200, body: [] });
  responses.set('/wiki/api/v2/pages?', { status: 200, body: { results: [], _links: { base: 'https://s.atlassian.net/wiki' } } });
});

describe('the Forge site transport', () => {
  it('reads as the user through the current endpoints', async () => {
    const graph = await loadOrgGraphFromSite();
    expect(vi.mocked(asUser)).toHaveBeenCalled();
    expect(calls.map((c) => `${c.product} ${c.path.split('?')[0]}`)).toEqual([
      'jira /rest/api/3/search/jql',
      'confluence /wiki/api/v2/pages',
      'jira /rest/api/3/issue/PAY-1/remotelink',
    ]);
    expect(graph.workItems[0]?.ref.url).toBe('https://s.atlassian.net/browse/PAY-1');
  });

  it('turns a failed call into a status error, retrying a rate limit first', async () => {
    responses.set('/rest/api/3/myself', { status: 403 });
    await expect(forgeRequester().jira('/rest/api/3/myself')).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(1);

    calls.length = 0;
    responses.set('/rest/api/3/limited', { status: 429, headers: { 'Retry-After': '9' } });
    const error = await forgeRequester().jira('/rest/api/3/limited').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SiteRequestError);
    expect((error as SiteRequestError).retryAfterSeconds).toBe(9); // longer than the cap: reported, not waited on
    expect(calls).toHaveLength(1);
  });
});

describe('the per-user graph cache', () => {
  it('caches per account and never serves one account to another', async () => {
    await loadSanitizedSiteGraph(undefined, 'acc-1');
    await loadSanitizedSiteGraph(undefined, 'acc-1');
    const afterFirstUser = calls.length;
    await loadSanitizedSiteGraph(undefined, 'acc-2');
    expect(calls.length).toBe(afterFirstUser * 2); // a second user triggers their own read
    expect([...store.keys()].sort()).toEqual([graphCacheKey('acc-1'), graphCacheKey('acc-2')]);
  });

  it('caches nothing when the invocation has no user', async () => {
    await loadSanitizedSiteGraph();
    await loadSanitizedSiteGraph();
    expect(store.size).toBe(0);
    expect(calls.filter((c) => c.path.startsWith('/rest/api/3/search/jql'))).toHaveLength(2);
  });

  it('keeps cache keys inside the KVS character set', () => {
    expect(graphCacheKey('712020:3b8a-ffee')).toBe('org-graph:712020:3b8a-ffee');
    expect(graphCacheKey('a/b?c')).toBe('org-graph:a_b_c');
  });
});
